import "server-only";
import { after } from "next/server";

/**
 * Fast path to n8n: fire a webhook after the response is sent. Durable state
 * lives in Postgres (queued rows); the n8n sweepers pick up anything this
 * misses, so a lost call only costs latency.
 */
export function dispatchToN8n(path: "generate" | "render" | "agent-chat", payload: Record<string, unknown>) {
  const base = process.env.N8N_WEBHOOK_BASE_URL?.trim().replace(/\/$/, "");
  if (!base) return;
  after(async () => {
    try {
      await fetch(`${base}/acs-${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-acs-service-token": process.env.ACS_INTERNAL_SERVICE_TOKEN ?? "",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // swept by the scheduler
    }
  });
}
