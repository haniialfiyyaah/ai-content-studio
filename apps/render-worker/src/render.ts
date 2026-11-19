import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

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
  error?: string;
  message?: string;
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

  try {
    // Dynamic import keeps default installs light (disk-constrained local stacks).
    const remotionRenderer = await import("@remotion/renderer");
    const remotion = await import("remotion");
    void remotion;

    const outDir = process.env.ACS_RENDER_OUTPUT_DIR ?? "/tmp/acs-renders";
    await mkdir(outDir, { recursive: true });
    const outputPath = join(outDir, `${jobId ?? randomUUID()}.mp4`);

    // Composition entry is apps/render-worker/src/compositions/Root.tsx once
    // Remotion bundling is configured. Until then fail loudly — no fake MP4.
    if (typeof remotionRenderer.renderMedia !== "function") {
      throw new Error("REMOTION_RENDER_MEDIA_MISSING");
    }

    await writeFile(
      join(outDir, `${jobId ?? "job"}.meta.json`),
      JSON.stringify({
        title: body.title ?? "Untitled",
        scenes: body.scenes ?? [],
        note: "Bundle + renderMedia wiring required before live encode",
      }),
      "utf8",
    );

    return {
      status: "failed",
      fixture: false,
      remotion: true,
      jobId,
      attemptId,
      outputPath: null,
      error: "REMOTION_BUNDLE_NOT_CONFIGURED",
      message:
        "Remotion packages detected but composition bundling is not configured yet.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (message.includes("Cannot find package") || message.includes("Cannot find module")) {
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
      remotion: false,
      jobId,
      attemptId,
      outputPath: null,
      error: "REMOTION_RENDER_FAILED",
      message,
    };
  }
}
