"use client";

import {
  canRenderMediaOnWeb,
  renderMediaOnWeb,
} from "@remotion/web-renderer";
import {
  BROWSER_COMPOSITION,
  ShortFormVideo,
  durationInFramesForScenes,
  type ShortFormScene,
} from "@/remotion/short-form-video";

export interface BrowserExportInput {
  title: string;
  scenes: ShortFormScene[];
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}

export interface BrowserCompatResult {
  canRender: boolean;
  issues: Array<{ message: string; severity: string }>;
  resolvedVideoCodec: string | null;
}

/** Checks WebCodecs / encoder support for the MVP 720p MP4 settings. */
export async function checkBrowserRenderCompat(): Promise<BrowserCompatResult> {
  const result = await canRenderMediaOnWeb({
    width: BROWSER_COMPOSITION.width,
    height: BROWSER_COMPOSITION.height,
    container: "mp4",
    videoCodec: "h264",
    muted: true,
  });

  return {
    canRender: result.canRender,
    issues: result.issues.map((issue) => ({
      message: issue.message,
      severity: issue.severity,
    })),
    resolvedVideoCodec: result.resolvedVideoCodec,
  };
}

/**
 * Renders a short muted MP4 in-browser. Caller must ensure only one render
 * runs at a time and must upload the blob via the complete API.
 */
export async function exportShortFormMp4(
  input: BrowserExportInput,
): Promise<{ blob: Blob; durationMs: number; durationInFrames: number }> {
  const scenes =
    input.scenes.length > 0
      ? input.scenes.slice(0, BROWSER_COMPOSITION.maxScenes)
      : [{ caption: "AI Content Studio" }];

  const durationInFrames = durationInFramesForScenes(scenes.length);
  const durationMs = Math.round(
    (durationInFrames / BROWSER_COMPOSITION.fps) * 1000,
  );

  const inputProps = {
    title: input.title,
    scenes,
  };

  const { getBlob } = await renderMediaOnWeb({
    composition: {
      component: ShortFormVideo,
      id: BROWSER_COMPOSITION.id,
      width: BROWSER_COMPOSITION.width,
      height: BROWSER_COMPOSITION.height,
      fps: BROWSER_COMPOSITION.fps,
      durationInFrames,
      defaultProps: {
        title: "Content Studio",
        scenes: [{ caption: "AI Content Studio" }],
      },
      calculateMetadata: null,
    },
    inputProps,
    container: "mp4",
    videoCodec: "h264",
    muted: true,
    signal: input.signal ?? undefined,
    onProgress: input.onProgress
      ? ({ progress }) => {
          input.onProgress?.(progress);
        }
      : undefined,
  });

  const blob = await getBlob();
  return { blob, durationMs, durationInFrames };
}
