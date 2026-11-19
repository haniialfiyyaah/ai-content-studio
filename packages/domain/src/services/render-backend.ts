/**
 * Render backend selection for Remotion video production.
 *
 * - `browser` — user-initiated @remotion/web-renderer (MVP default)
 * - `vercel_sandbox` — future unattended cloud render (not implemented)
 * - `legacy_worker` — optional apps/render-worker HTTP path (not required)
 *
 * WF-02 and domain job lifecycle stay backend-agnostic: adapters prepare or
 * complete jobs; only a verified MP4 upload may mark ready_for_review.
 */

export type RemotionRenderBackend =
  | "browser"
  | "vercel_sandbox"
  | "legacy_worker";

export const AWAITING_BROWSER_RENDER = "awaiting_browser_render" as const;
export const BROWSER_RENDER_INTERRUPTED = "browser_render_interrupted" as const;

/** Reads ACS_REMOTION_RENDER_BACKEND (default: browser). */
export function resolveRemotionRenderBackend(
  env: NodeJS.ProcessEnv = process.env,
): RemotionRenderBackend {
  const raw = (env.ACS_REMOTION_RENDER_BACKEND ?? "browser").trim().toLowerCase();
  if (raw === "vercel_sandbox" || raw === "legacy_worker" || raw === "browser") {
    return raw;
  }
  return "browser";
}

export interface PrepareBrowserRenderResult {
  backend: "browser";
  awaitingBrowser: true;
  jobId: string;
  attemptId: string;
  message: string;
}

export interface RemotionWorkerRequirement {
  backend: RemotionRenderBackend;
  workerRequired: boolean;
  note: string;
}

/** Documents that apps/render-worker is optional under the browser path. */
export function remotionWorkerRequirement(
  backend: RemotionRenderBackend = resolveRemotionRenderBackend(),
): RemotionWorkerRequirement {
  return {
    backend,
    workerRequired: backend === "legacy_worker",
    note:
      backend === "browser"
        ? "Browser @remotion/web-renderer path — apps/render-worker is not required."
        : backend === "vercel_sandbox"
          ? "Vercel Sandbox adapter is not provisioned yet — do not mark unattended rendering complete."
          : "Legacy worker path selected — RENDER_WORKER_URL must be reachable.",
  };
}
