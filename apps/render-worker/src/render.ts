import { mkdir, access, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

export interface RenderRequest {
  jobId?: string;
  attemptId?: string;
  title?: string;
  scenes?: Array<{ narration?: string; caption?: string }>;
}

export interface RenderResult {
  status: "completed" | "accepted" | "failed";
  fixture: boolean;
  remotion: boolean;
  jobId: string | null;
  attemptId: string | null;
  outputPath: string | null;
  bytes?: number;
  durationMs?: number;
  error?: string;
  message?: string;
}

const require = createRequire(import.meta.url);
const workerRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

let cachedBundle: string | null = null;
let bundlePromise: Promise<string> | null = null;

function remotionPackagesInstalled(): boolean {
  try {
    require.resolve("@remotion/bundler");
    require.resolve("@remotion/renderer");
    require.resolve("remotion");
    return true;
  } catch {
    return false;
  }
}

async function getOrCreateBundle(): Promise<string> {
  if (cachedBundle) {
    await access(cachedBundle);
    return cachedBundle;
  }
  if (bundlePromise) return bundlePromise;

  bundlePromise = (async () => {
    const { bundle } = await import("@remotion/bundler");
    const entryPoint = join(workerRoot, "src", "remotion-entry.ts");
    const serveUrl = await bundle({
      entryPoint,
      // Keep webpack defaults — no custom remotion.config yet.
      webpackOverride: (config) => config,
    });
    cachedBundle = serveUrl;
    return serveUrl;
  })();

  try {
    return await bundlePromise;
  } catch (error) {
    bundlePromise = null;
    throw error;
  }
}

/**
 * Attempts a Remotion encode when ACS_REMOTION_LIVE=true and packages exist.
 * Otherwise returns an explicit fixture acceptance — never claims live success.
 */
export async function renderShortForm(
  body: RenderRequest,
): Promise<RenderResult> {
  const jobId = body.jobId ?? null;
  const attemptId = body.attemptId ?? null;
  const live = process.env.ACS_REMOTION_LIVE === "true";

  if (!live) {
    return {
      status: "accepted",
      fixture: true,
      remotion: false,
      jobId,
      attemptId,
      outputPath: `fixture/renders/${jobId ?? randomUUID()}.mp4`,
      message:
        "Remotion live encode disabled. Set ACS_REMOTION_LIVE=true after installing remotion/@remotion/renderer.",
    };
  }

  if (!remotionPackagesInstalled()) {
    return {
      status: "failed",
      fixture: false,
      remotion: false,
      jobId,
      attemptId,
      outputPath: null,
      error: "REMOTION_NOT_INSTALLED",
      message:
        "Install remotion and @remotion/renderer in apps/render-worker to enable live encode.",
    };
  }

  const started = Date.now();

  try {
    const { renderMedia, selectComposition, ensureBrowser } = await import(
      "@remotion/renderer"
    );
    const { COMPOSITION_ID } = await import("./compositions/Root.js");

    // Ensure Chrome Headless Shell is fully downloaded/extracted before encode.
    const browser = await ensureBrowser();
    const browserExecutable =
      process.env.REMOTION_BROWSER_EXECUTABLE ??
      (browser && "path" in browser ? (browser.path as string) : undefined);

    const outDir = process.env.ACS_RENDER_OUTPUT_DIR ?? join(workerRoot, "out");
    await mkdir(outDir, { recursive: true });
    const outputPath = join(outDir, `${jobId ?? randomUUID()}.mp4`);

    const inputProps = {
      title: body.title?.trim() || "AI Content Studio",
      scenes:
        body.scenes && body.scenes.length > 0
          ? body.scenes
          : [{ caption: "Authorized Remotion render" }],
    };

    const serveUrl = await getOrCreateBundle();
    const composition = await selectComposition({
      serveUrl,
      id: COMPOSITION_ID,
      inputProps,
      ...(browserExecutable ? { browserExecutable } : {}),
    });

    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: outputPath,
      inputProps,
      // Cap concurrency for laptop-friendly encodes.
      concurrency: Number(process.env.ACS_REMOTION_CONCURRENCY ?? 2) || 2,
      ...(browserExecutable ? { browserExecutable } : {}),
    });

    const fileStat = await stat(outputPath);
    if (!fileStat.isFile() || fileStat.size < 1024) {
      throw new Error("REMOTION_OUTPUT_TOO_SMALL");
    }

    return {
      status: "completed",
      fixture: false,
      remotion: true,
      jobId,
      attemptId,
      outputPath,
      bytes: fileStat.size,
      durationMs: Date.now() - started,
      message: "Remotion live encode completed",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (
      message.includes("Cannot find package") ||
      message.includes("Cannot find module")
    ) {
      return {
        status: "failed",
        fixture: false,
        remotion: false,
        jobId,
        attemptId,
        outputPath: null,
        error: "REMOTION_NOT_INSTALLED",
        message:
          "Install remotion and @remotion/renderer in apps/render-worker to enable live encode.",
      };
    }

    return {
      status: "failed",
      fixture: false,
      remotion: true,
      jobId,
      attemptId,
      outputPath: null,
      error: "REMOTION_RENDER_FAILED",
      message,
      durationMs: Date.now() - started,
    };
  }
}
