"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/projects/status-pill";

interface LaunchConcept {
  id: string;
  title: string | null;
  updatedAt: string;
  source: string | null;
  reviewStatus: string;
  selected: boolean;
}

/**
 * Draft-only initial launch picker. Selection does not approve concepts.
 */
export function InitialLaunchList({
  projectId,
  settingsVersion,
  concepts,
}: {
  projectId: string;
  settingsVersion: number;
  concepts: LaunchConcept[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(
    () => new Set(concepts.filter((concept) => concept.selected).map((c) => c.id)),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/initial-launch`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conceptIds: [...selected],
          expectedVersion: settingsVersion,
        }),
      });
      const json = (await res.json()) as {
        status: string;
        error?: { message?: string };
      };
      if (!res.ok || json.status === "error") {
        setError(json.error?.message ?? "Unable to save launch selection");
        return;
      }
      setMessage("Launch selection saved. Concepts stay unapproved until you approve them.");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Choose which concepts belong in the first launch. This does not approve
        them.
      </p>
      <ul className="flex flex-col gap-3">
        {concepts.map((concept) => (
          <li
            key={concept.id}
            className="flex flex-col gap-3 rounded-xl border border-border bg-surface-strong px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.has(concept.id)}
                onChange={() => toggle(concept.id)}
              />
              <span>
                <Link
                  href={`/content/${concept.id}`}
                  className="font-medium hover:text-accent"
                >
                  {concept.title?.trim() || "Untitled concept"}
                </Link>
                <span className="mt-1 block text-xs text-muted">
                  {concept.source ?? "web"} · {concept.updatedAt}
                </span>
              </span>
            </label>
            <StatusPill status={concept.reviewStatus} />
          </li>
        ))}
      </ul>
      <Button disabled={pending} onClick={() => void save()}>
        {pending ? "Saving…" : "Save launch selection"}
      </Button>
      {message ? <p className="text-sm text-success">{message}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
