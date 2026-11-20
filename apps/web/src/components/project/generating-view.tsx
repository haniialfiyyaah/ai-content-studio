import { Check, Clock, Loader2 } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import type { MessageRow, RunRow } from "@/lib/server/rows";

const STAGES = [
  { key: "understanding", label: "Understanding your idea" },
  { key: "research", label: "Researching angles" },
  { key: "creative_kit", label: "Creating the Creative Kit" },
  { key: "contents", label: "Developing content and scenes" },
  { key: "saving", label: "Preparing your workspace" },
];

export function GeneratingView({ projectId, run, messages, failed }: { projectId: string; run: RunRow | null; messages: MessageRow[]; failed: boolean }) {
  const current = Math.max(0, STAGES.findIndex((s) => s.key === run?.stage));
  const progress = failed ? run?.progress ?? 0 : Math.max(run?.progress ?? 4, 4);
  return (
    <main className="planning">
      <div className="eyebrow">CREATIVE AGENT</div>
      <h1 style={{ fontSize: 31, marginBottom: 8 }}>{failed ? "Generation didn't finish" : "Preparing your Project"}</h1>
      <p className="small muted" style={{ marginBottom: 22 }}>
        {failed
          ? run?.error || "Something went wrong while generating. You can retry — nothing was published."
          : "Your first message started planning automatically. The Project opens here as soon as the plan is ready — no need to refresh."}
      </p>
      <div className="planning-grid">
        <div className="card pad planning-chat">
          <div className="section"><h2>Conversation</h2><span className="pill">New idea</span></div>
          <div className="stack">
            {messages.map((m) => (
              <div key={m.id} className={`bubble ${m.role === "user" ? "user" : "agent"}`} style={{ maxWidth: "88%" }}>{m.content}</div>
            ))}
          </div>
        </div>
        <div className="card pad">
          <h2 style={{ fontSize: 16 }}>Project preparation</h2>
          <p className="xs muted" style={{ margin: "5px 0 16px" }}>Live progress from the generation workflow.</p>
          <div className="progressbar" style={{ marginBottom: 12 }}><span style={{ width: `${progress}%` }} /></div>
          <div className="planning-stages">
            {STAGES.map((s, i) => {
              const done = !failed && (run?.status === "succeeded" || i < current);
              const active = !failed && !done && i === current && run?.status !== "queued";
              return (
                <div key={s.key} className={`planning-step ${done ? "done" : active ? "active" : ""}`}>
                  {done ? <Check size={15} /> : active ? <Loader2 size={15} className="spin" /> : <Clock size={15} />}
                  {s.label}
                </div>
              );
            })}
          </div>
          {failed && (
            <div style={{ marginTop: 16 }}>
              <ActionButton path={`/api/projects/${projectId}/retry`} className="btn primary">Retry generation</ActionButton>
            </div>
          )}
          {run?.status === "queued" && !failed && <p className="xs faint" style={{ marginTop: 12 }}>Queued — the agent picks this up within a minute.</p>}
        </div>
      </div>
    </main>
  );
}
