"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/client/api";

export interface AgentActionState {
  projectId: string;
  drafts: number;
  approvedWithoutVideo: number;
  hasSchedule: boolean;
  firstPendingId: string | null;
  status: string;
}

/** Telegram-style quick actions under the agent chat. */
export function AgentActions(s: AgentActionState) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [which, setWhich] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (key: string, path: string, body?: unknown, then?: () => void) => {
    setWhich(key);
    setError(null);
    start(async () => {
      try {
        await api(path, "POST", body ?? {});
        then?.();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  };
  const nav = (path: string) => router.push(path, { scroll: false });
  const chip = (key: string, label: string, onClick: () => void, primary = false) => (
    <button key={key} className={`btn small ${primary ? "primary" : "soft"}`} disabled={busy} onClick={onClick}>
      {busy && which === key ? <Spinner size={12} /> : null} {label}
    </button>
  );

  if (s.status === "setup" || s.status === "stopped") return null;
  const actions = [
    (s.drafts > 0 || s.status === "draft") && chip("aa", s.drafts > 0 ? `✅ Approve & schedule (${s.drafts})` : "🚀 Go live", () => nav(`/projects/${s.projectId}?tab=overview#launch`), true),
    s.drafts > 0 && s.firstPendingId && chip("rv", "▶️ Review next", () => nav(`/projects/${s.projectId}?tab=content&review=${s.firstPendingId}`)),
    s.approvedWithoutVideo > 0 &&
      chip("ra", `🎬 Render ${s.approvedWithoutVideo}`, () => run("ra", `/api/projects/${s.projectId}/render-all`, undefined, () => nav(`/projects/${s.projectId}?tab=videos`))),
    s.drafts === 0 && !s.hasSchedule && chip("sc", "📅 Set schedule", () => nav(`/projects/${s.projectId}?tab=schedule`)),
    chip("gm", "💡 3 more ideas", () => run("gm", `/api/projects/${s.projectId}/generate-more`, { count: 3 })),
  ].filter(Boolean);

  return (
    <div style={{ padding: "10px 13px 0", borderTop: "1px solid var(--border)" }}>
      <div className="actions" style={{ gap: 6 }}>{actions}</div>
      {error && <div className="err">{error}</div>}
    </div>
  );
}
