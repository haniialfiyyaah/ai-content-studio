"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SPEND_LIMIT_USD = 5;
const SPEND_VALID_DAYS = 30;

/**
 * Grants produce_paid_media for one Project after an explicit second click.
 * The limit and expiry are stated before the creator confirms.
 */
export function AuthorizeSpendButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function authorize() {
    setPending(true);
    setError(null);
    try {
      const validUntil = new Date(
        Date.now() + SPEND_VALID_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();
      const res = await fetch(`/api/projects/${projectId}/grants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "produce_paid_media",
          limitAmount: SPEND_LIMIT_USD,
          currency: "USD",
          validUntil,
        }),
      });
      const json = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setError(json.error?.message ?? "Could not authorize spend.");
        return;
      }
      setConfirming(false);
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        className="primary-button primary-button--sm"
        onClick={() => setConfirming(true)}
      >
        Authorize spend
      </button>
    );
  }

  return (
    <div className="spend-confirm" role="group" aria-label="Confirm spend">
      <p>
        Up to <span className="mono">${SPEND_LIMIT_USD.toFixed(2)}</span> for{" "}
        {SPEND_VALID_DAYS} days on this Project.
      </p>
      <div className="spend-confirm-actions">
        <button
          type="button"
          className="primary-button primary-button--sm"
          disabled={pending}
          onClick={() => void authorize()}
        >
          {pending ? "Authorizing…" : "Confirm"}
        </button>
        <button
          type="button"
          className="secondary-button secondary-button--sm"
          disabled={pending}
          onClick={() => setConfirming(false)}
        >
          Cancel
        </button>
      </div>
      {error ? (
        <p role="alert" style={{ color: "var(--clay)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
