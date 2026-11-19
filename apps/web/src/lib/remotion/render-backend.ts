/**
 * Web-app mirror of domain render-backend helpers (avoids importing Node process
 * types into client bundles via domain barrel when not needed).
 */
export type RemotionRenderBackend =
  | "browser"
  | "vercel_sandbox"
  | "legacy_worker";

export function resolveRemotionRenderBackend(): RemotionRenderBackend {
  const raw = (
    process.env.ACS_REMOTION_RENDER_BACKEND ?? "browser"
  )
    .trim()
    .toLowerCase();
  if (raw === "vercel_sandbox" || raw === "legacy_worker" || raw === "browser") {
    return raw;
  }
  return "browser";
}
