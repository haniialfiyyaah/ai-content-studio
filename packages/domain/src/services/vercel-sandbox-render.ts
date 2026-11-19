import { AppError, ErrorCodes } from "@acs/schemas";
import type { RemotionRenderBackend } from "./render-backend";

/**
 * Future adapter for unattended Remotion encoding in Vercel Sandbox.
 *
 * Intentionally unimplemented: do not provision Sandbox or start billable
 * renders without explicit authorization. WF-02 / video domain should call
 * through this surface once Sandbox is approved — no rewrite of job lifecycle.
 */
export interface SandboxRenderRequest {
  jobId: string;
  attemptId?: string;
  title?: string;
  scenes?: Array<{ narration?: string; caption?: string }>;
  correlationId?: string;
}

export interface SandboxRenderResult {
  backend: "vercel_sandbox";
  status: "not_provisioned";
  message: string;
}

/** Honest stub — always fails closed until Sandbox is authorized + wired. */
export async function renderRemotionInVercelSandbox(
  _request: SandboxRenderRequest,
): Promise<SandboxRenderResult> {
  throw new AppError(
    ErrorCodes.PROVIDER_UNAVAILABLE,
    "Vercel Sandbox Remotion rendering is not provisioned. Browser export remains the MVP path.",
    501,
    {
      backend: "vercel_sandbox" satisfies RemotionRenderBackend,
      incomplete: [
        "Sandbox project / runtime image with Remotion",
        "Internal adapter invoked from WF-02 remotion step",
        "Artifact upload to Supabase renders + completeVideoJob",
        "Headless progress + failure reconciliation without a browser tab",
      ],
    },
  );
}

/** Checklist of unattended-production gaps (documentation helper). */
export function unattendedRemotionGaps(): string[] {
  return [
    "No Vercel Sandbox provisioned or billed",
    "n8n cannot finish remotion jobs without a browser tab on the browser backend",
    "fal.ai footage + ElevenLabs narration not wired into ShortFormVideo yet",
    "Hybrid production mode still fixture/progress-only",
    "Longer compositions / 1080p / audio tracks not enabled for browser MVP",
  ];
}
