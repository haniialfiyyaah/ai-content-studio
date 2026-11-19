"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * Approve, revoke, or regenerate a video attempt from the review screen.
 */
export function VideoReviewActions({
  attemptId,
  jobId,
  status,
  revoked,
}: {
  attemptId: string;
  jobId: string;
  status: string;
  revoked: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function post(url: string, action: string, body?: unknown) {
    setPending(action);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const json = (await res.json()) as {
        status: string;
        error?: { message?: string };
      };
      if (!res.ok || json.status === "error") {
        setError(json.error?.message ?? "Request failed");
        return;
      }
      setMessage(
        action === "approve"
          ? "Video approved."
          : action === "revoke"
            ? "Approval revoked."
            : "A new attempt was queued.",
      );
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setPending(null);
    }
  }

  const canApprove = status === "ready_for_review" && !revoked;

  return (
    <div className="mt-6 flex flex-col items-start gap-3">
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!canApprove || pending !== null}
          onClick={() =>
            void post(`/api/video-attempts/${attemptId}/approve`, "approve")
          }
        >
          {pending === "approve" ? "Approving…" : "Approve video"}
        </Button>
        <Button
          variant="secondary"
          disabled={status !== "approved" || pending !== null}
          onClick={() =>
            void post(`/api/video-attempts/${attemptId}/revoke`, "revoke")
          }
        >
          {pending === "revoke" ? "Revoking…" : "Revoke"}
        </Button>
        <Button
          variant="secondary"
          disabled={pending !== null}
          onClick={() =>
            void post(`/api/video-jobs/${jobId}/regenerate`, "regenerate", {
              reason: "review",
            })
          }
        >
          {pending === "regenerate" ? "Queuing…" : "Regenerate"}
        </Button>
      </div>
      {!canApprove && status !== "approved" ? (
        <p className="text-sm text-muted">
          Approval is available when the attempt is ready for review and has a
          verified output.
        </p>
      ) : null}
      {message ? <p className="text-sm text-success">{message}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
