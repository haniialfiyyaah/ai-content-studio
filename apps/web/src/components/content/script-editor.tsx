"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { ConceptContent } from "@acs/schemas";

/**
 * Saves script edits as a new draft version. Does not overwrite approvals.
 */
export function ScriptEditor({
  conceptId,
  initial,
  fixtureNote,
}: {
  conceptId: string;
  initial: ConceptContent;
  fixtureNote: boolean;
}) {
  const router = useRouter();
  const [hook, setHook] = useState(initial.hook ?? "");
  const [script, setScript] = useState(initial.script ?? "");
  const [pending, setPending] = useState<"save" | "fill" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setPending("save");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/concepts/${conceptId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: {
            ...initial,
            hook,
            script,
            notes: fixtureNote
              ? "Edited from a fixture planning draft."
              : initial.notes,
          },
        }),
      });
      const json = (await res.json()) as {
        status: string;
        error?: { message?: string };
      };
      if (!res.ok || json.status === "error") {
        setError(json.error?.message ?? "Unable to save script");
        return;
      }
      setMessage("Saved as a new draft version.");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setPending(null);
    }
  }

  async function fillDraft() {
    setPending("fill");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/concepts/${conceptId}/planning-draft`, {
        method: "POST",
      });
      const json = (await res.json()) as {
        status: string;
        error?: { message?: string };
      };
      if (!res.ok || json.status === "error") {
        setError(json.error?.message ?? "Unable to fill planning draft");
        return;
      }
      setMessage("Planning draft filled. This content is fixture-labeled.");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setPending(null);
    }
  }

  const empty = !script.trim() && !hook.trim();

  return (
    <div className="space-y-4">
      {fixtureNote ? (
        <p className="rounded-lg border border-border bg-accent-soft px-3 py-2 text-sm text-foreground">
          Fixture planning draft. This is not a live model result.
        </p>
      ) : null}
      <label className="block text-sm font-medium" htmlFor="concept-hook">
        Hook
      </label>
      <input
        id="concept-hook"
        value={hook}
        onChange={(event) => setHook(event.target.value)}
        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
      />
      <label className="block text-sm font-medium" htmlFor="concept-script">
        Script
      </label>
      <textarea
        id="concept-script"
        value={script}
        onChange={(event) => setScript(event.target.value)}
        rows={10}
        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
      />
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending !== null} onClick={() => void save()}>
          {pending === "save" ? "Saving…" : "Save new draft"}
        </Button>
        {empty ? (
          <Button
            variant="secondary"
            disabled={pending !== null}
            onClick={() => void fillDraft()}
          >
            {pending === "fill" ? "Filling…" : "Fill planning draft"}
          </Button>
        ) : null}
      </div>
      {message ? <p className="text-sm text-success">{message}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
