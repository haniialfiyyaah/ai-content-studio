"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * Approve working version + edit note (edit always creates draft N+1).
 */
export function ContentActions({
  conceptId,
  workingVersionId,
  reviewStatus,
  isApprovedLive,
}: {
  conceptId: string;
  workingVersionId: string | null;
  reviewStatus: string | null;
  isApprovedLive: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"approve" | "edit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function approve() {
    if (!workingVersionId) return;
    setPending("approve");
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(
        `/api/concept-versions/${workingVersionId}/approve`,
        { method: "POST" },
      );
      const json = (await res.json()) as {
        status: string;
        error?: { message?: string } | null;
      };

      if (!res.ok || json.status === "error") {
        setError(json.error?.message ?? "Unable to approve concept version");
        return;
      }

      setMessage("Working version approved.");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setPending(null);
    }
  }

  async function editRevision() {
    setPending("edit");
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(`/api/concepts/${conceptId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as {
        status: string;
        error?: { message?: string } | null;
      };

      if (!res.ok || json.status === "error") {
        setError(json.error?.message ?? "Unable to create draft revision");
        return;
      }

      setMessage("Draft revision created. Edit the working version next.");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setPending(null);
    }
  }

  const canApprove =
    Boolean(workingVersionId) && !isApprovedLive && reviewStatus !== "approved";

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={!canApprove || pending !== null}
          onClick={() => void approve()}
        >
          {pending === "approve" ? "Approving…" : "Approve"}
        </Button>
        <Button
          variant="secondary"
          disabled={pending !== null}
          onClick={() => void editRevision()}
        >
          {pending === "edit" ? "Creating…" : "Edit"}
        </Button>
      </div>
      <p className="max-w-xs text-right text-xs text-muted">
        Edit note: editing always creates a new immutable draft version (N+1).
        Prior approvals stay in history and are never overwritten.
      </p>
      {message && <p className="text-sm text-success">{message}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
