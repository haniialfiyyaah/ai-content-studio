// AI Content Studio renderer: POST /render → 202, renders the "Short" Remotion
// composition, uploads the MP4 to a Supabase signed upload URL, then calls back.
import http from "node:http";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { renderMedia, selectComposition } from "@remotion/renderer";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const TOKEN = process.env.RENDERER_TOKEN || "";
// Memory-safe defaults for small instances; raise RENDER_CONCURRENCY on bigger plans.
const CONCURRENCY = Number(process.env.RENDER_CONCURRENCY || 1);
// 0.6667 → 720×1280 (fits ~512 MB instances); set RENDER_SCALE=1 for 1080×1920 on ≥1.5 GB.
const SCALE = Number(process.env.RENDER_SCALE || 0.6667);
const X264_PRESET = process.env.RENDER_X264_PRESET || "veryfast";

if (!TOKEN) {
  console.error("RENDERER_TOKEN is required");
  process.exit(1);
}

// Pre-built at image build time (`remotion bundle` → ./build) so webpack never
// runs in the server process — saves hundreds of MB on small instances.
const prebuilt = path.join(here, "build");
const serveUrl = existsSync(path.join(prebuilt, "index.html"))
  ? Promise.resolve(prebuilt).then((dir) => {
      console.log("[renderer] using prebuilt bundle");
      return dir;
    })
  : import("@remotion/bundler")
      .then(({ bundle }) => bundle({ entryPoint: path.join(here, "src/remotion/index.ts") }))
      .then((url) => {
        console.log("[renderer] bundle ready (built at boot)");
        return url;
      });

const queue = [];
let busy = false;
let current = null;

async function runQueue() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const job = queue.shift();
    current = job.renderId;
    await renderJob(job);
    current = null;
  }
  busy = false;
}

async function callback(job, body) {
  try {
    await fetch(job.callbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-renderer-token": TOKEN },
      body: JSON.stringify({ renderId: job.renderId, ...body }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    console.error("[renderer] callback failed", job.renderId, e);
  }
}

async function renderJob(job) {
  const out = path.join(tmpdir(), `${job.renderId}.mp4`);
  const started = Date.now();
  try {
    const url = await serveUrl;
    const composition = await selectComposition({
      serveUrl: url,
      id: "Short",
      inputProps: job.props,

    });
    await renderMedia({
      composition,
      serveUrl: url,
      codec: "h264",
      outputLocation: out,
      inputProps: job.props,
      concurrency: CONCURRENCY,
      imageFormat: "jpeg",
      jpegQuality: 85,
      // Keep peak memory low: encode after frames are produced.
      disallowParallelEncoding: process.env.RENDER_PARALLEL_ENCODING !== "true",

      // Compression: visually clean for Shorts, ~2-5 MB for 15-30 s (Telegram/YouTube friendly).
      crf: Number(process.env.RENDER_CRF || 25),
      x264Preset: X264_PRESET,
      scale: SCALE,
      audioBitrate: "128k",
      timeoutInMilliseconds: 120_000,
    });
    const bytes = await readFile(out);
    const put = await fetch(job.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4", "x-upsert": "true" },
      body: bytes,
    });
    if (!put.ok) throw new Error(`upload failed (${put.status}): ${(await put.text()).slice(0, 200)}`);
    const durationSeconds = composition.durationInFrames / composition.fps;
    console.log(`[renderer] ${job.renderId} done in ${Math.round((Date.now() - started) / 1000)}s`);
    await callback(job, { ok: true, durationSeconds, bytes: bytes.length });
  } catch (e) {
    console.error("[renderer] failed", job.renderId, e);
    await callback(job, { ok: false, error: String(e?.message || e).slice(0, 400) });
  } finally {
    await rm(out, { force: true });
  }
}

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

http
  .createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      return send(res, 200, { ok: true, queued: queue.length, rendering: current });
    }
    if (req.method !== "POST" || req.url !== "/render") return send(res, 404, { error: "not found" });
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { error: "unauthorized" });

    let raw = "";
    for await (const chunk of req) raw += chunk;
    let job;
    try {
      job = JSON.parse(raw);
    } catch {
      return send(res, 400, { error: "invalid json" });
    }
    if (!job?.renderId || !job?.props?.scenes?.length || !job?.uploadUrl || !job?.callbackUrl) {
      return send(res, 400, { error: "renderId, props.scenes, uploadUrl and callbackUrl are required" });
    }
    if (queue.some((j) => j.renderId === job.renderId) || current === job.renderId) {
      return send(res, 202, { accepted: true, duplicate: true });
    }
    queue.push(job);
    send(res, 202, { accepted: true, position: queue.length });
    void runQueue();
  })
  .listen(PORT, () => console.log(`[renderer] listening on :${PORT}`));
