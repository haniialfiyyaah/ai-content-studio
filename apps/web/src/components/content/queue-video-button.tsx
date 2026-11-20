"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type ProductionMode = "fal" | "remotion" | "hybrid";

const MODE_NOTES: Record<ProductionMode, string> = {
  fal: "Submits to fal.ai and polls until the render is ready — works unattended, no browser tab needed.",
  remotion:
    "Parks the job at “awaiting browser render” until someone opens Content → Production and runs the browser export. Not suitable for unattended / Telegram-only review.",
  hybrid:
    "Not available headlessly yet — WF-02 will fail this job immediately. Use Content → Production → Browser video export with “include footage and narration” instead.",
};

/**
 * Enqueues paid video production for WF-02 — returns immediately (no browser wait).
 * Only `fal` can actually finish without a browser tab open; see MODE_NOTES.
 */
export function QueueVideoButton({
  conceptVersionId,
  canProduce,
  consentId,
}: {
  conceptVersionId: string;
  canProduce: boolean;
  consentId?: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<ProductionMode>("fal");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function queue() {
    if (!canProduce) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/concept-versions/${conceptVersionId}/render`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productionMode: mode,
            consentId: consentId || undefined,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      const json = (await res.json()) as {
        status?: string;
        data?: { job?: { id?: string }; reused?: boolean };
        error?: { message?: string };
      };
      if (!res.ok || json.status === "error") {
        setError(json.error?.message ?? "Could not queue video production");
        return;
      }
      const jobId = json.data?.job?.id;
      setMessage(
        json.data?.reused
          ? `Already queued${jobId ? ` · ${jobId.slice(0, 8)}` : ""}.`
          : `Queued for ${mode}${jobId ? ` · ${jobId.slice(0, 8)}` : ""}. Continue chatting — we’ll notify when it’s ready.`,
      );
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface-strong p-4">
      <div>
        <p className="text-sm font-medium">Queue video (n8n WF-02)</p>
        <p className="mt-1 text-xs text-muted">
          Enqueues a job and returns immediately. Only fal.ai completes
          unattended today — see the note below once you pick a mode.
        </p>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Generation mode</span>
        <select
          className="h-10 rounded-lg border border-border bg-background px-3"
          value={mode}
          disabled={!canProduce || pending}
          onChange={(event) =>
            setMode(event.target.value as ProductionMode)
          }
        >
          <option value="fal">fal.ai (unattended — recommended for Telegram)</option>
          <option value="remotion">Remotion (requires an open browser tab)</option>
          <option value="hybrid">Hybrid (not implemented headlessly)</option>
        </select>
      </label>
      <p className="text-xs text-muted">{MODE_NOTES[mode]}</p>
      <Button
        type="button"
        disabled={!canProduce || pending}
        onClick={() => void queue()}
      >
        {pending ? "Queuing…" : "Queue video"}
      </Button>
      {!canProduce ? (
        <p className="text-sm text-muted">
          Needs an approved concept and an active produce_paid_media grant.
        </p>
      ) : null}
      {message ? <p className="text-sm text-accent">{message}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
