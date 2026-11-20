import { after } from "next/server";

export interface VideoProductionDispatch {
  jobId: string;
  projectId: string;
  conceptVersionId: string;
  productionMode: string;
  consentId: string | null;
  idempotencyKey: string;
  correlationId: string;
}

/**
 * Fast path: wake WF-02 right after the response is sent. `after()` keeps the
 * serverless function alive until the request goes out (a bare `void fetch`
 * can be cut off on Vercel). If this is lost anyway, WF-02S picks the job up
 * from the `queued` state within ~2 minutes — the job row is the source of
 * truth, this call is only a latency optimisation.
 */
export function dispatchVideoProduction(payload: VideoProductionDispatch) {
  const webhookBase = process.env.N8N_WEBHOOK_BASE_URL?.trim();
  if (!webhookBase) return;

  after(async () => {
    try {
      await fetch(`${webhookBase.replace(/\/$/, "")}/video-production`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-acs-service-token": process.env.ACS_INTERNAL_SERVICE_TOKEN ?? "",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // WF-02S sweep will dispatch it.
    }
  });
}
