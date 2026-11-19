"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * Overview prompt from UX v2.7: the first message starts agent planning.
 */
export function OverviewPrompt() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const content = value.trim();
    if (!content || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const json = (await res.json()) as {
        status: string;
        data?: { projectId?: string | null; runId?: string | null };
        error?: { message?: string };
      };
      if (!res.ok || json.status === "error") {
        setError(json.error?.message ?? "Planning failed");
        return;
      }
      let projectId = json.data?.projectId ?? null;
      if (!projectId && json.data?.runId) {
        projectId = await waitForProject(json.data.runId);
      }
      if (projectId) {
        router.push(`/projects/${projectId}?tab=content`);
        router.refresh();
        return;
      }
      router.push("/agent");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="mt-6 space-y-3">
      <label className="block text-sm font-medium" htmlFor="overview-idea">
        Start from an idea
      </label>
      <textarea
        id="overview-idea"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={3}
        placeholder="I want to create content about..."
        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
      />
      <div className="flex flex-wrap gap-2">
        {[
          "I want to create affiliate content for home products",
          "I want to create a short product story",
        ].map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="rounded-full border border-border px-3 py-1 text-xs text-muted"
            onClick={() => setValue(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>
      <Button type="submit" disabled={pending || value.trim().length === 0}>
        {pending ? "Planning…" : "Plan with the agent"}
      </Button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <p className="text-xs text-muted">
        Planning uses n8n when its webhook is configured. Otherwise this app
        plans locally and labels fixture drafts.
      </p>
    </form>
  );
}

async function waitForProject(runId: string): Promise<string | null> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const res = await fetch(`/api/agent/runs/${runId}`);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { projectId?: string | null; status?: string };
    };
    if (json.data?.projectId) return json.data.projectId;
    if (json.data?.status === "failed") return null;
  }
  return null;
}
