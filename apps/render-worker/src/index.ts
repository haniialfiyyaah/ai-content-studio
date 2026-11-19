import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { renderShortForm } from "./render.js";

const port = Number(process.env.PORT ?? 3100);
const token = process.env.RENDER_WORKER_TOKEN ?? "local-render-worker-token";
const outputRoot = resolve(
  process.env.ACS_RENDER_OUTPUT_DIR ??
    new URL("../out", import.meta.url).pathname,
);

/**
 * Remotion render worker HTTP surface.
 * Default path is explicit fixture; live Remotion requires ACS_REMOTION_LIVE=true.
 */
const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    const live = process.env.ACS_REMOTION_LIVE === "true";
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        remotionLiveFlag: live,
        fixtureCapable: true,
        outputRoot,
      }),
    );
    return;
  }

  // Authenticated download of a completed local MP4 (dev / same-host transfer).
  if (req.method === "GET" && req.url?.startsWith("/outputs/")) {
    const auth = req.headers["x-render-token"];
    if (auth !== token) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "UNAUTHORIZED" }));
      return;
    }

    const name = basename(decodeURIComponent(req.url.slice("/outputs/".length)));
    const filePath = resolve(outputRoot, name);
    if (!filePath.startsWith(outputRoot)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "INVALID_PATH" }));
      return;
    }

    try {
      await access(filePath);
      const fileStat = await stat(filePath);
      res.writeHead(200, {
        "Content-Type": "video/mp4",
        "Content-Length": fileStat.size,
        "Content-Disposition": `inline; filename="${name}"`,
      });
      createReadStream(filePath).pipe(res);
    } catch {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "NOT_FOUND" }));
    }
    return;
  }

  if (req.method === "POST" && req.url === "/render") {
    const auth = req.headers["x-render-token"];
    if (auth !== token) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "UNAUTHORIZED" }));
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    let body: {
      jobId?: string;
      attemptId?: string;
      title?: string;
      scenes?: Array<{ narration?: string; caption?: string }>;
    } = {};
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "VALIDATION_ERROR" }));
      return;
    }

    const result = await renderShortForm(body);
    const statusCode =
      result.status === "failed"
        ? 500
        : result.status === "accepted"
          ? 202
          : 200;
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
    return;
  }

  res.writeHead(404).end();
});

server.listen(port, () => {
  console.info(`[render-worker] listening on :${port}`);
});
