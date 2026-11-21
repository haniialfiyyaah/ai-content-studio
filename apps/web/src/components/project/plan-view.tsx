"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Plus, SkipForward, Sparkles, Undo2 } from "lucide-react";
import { InlineAuto } from "./inline-auto";
import { api } from "@/lib/client/api";
import { compose, sentToChat } from "@/lib/client/compose";
import { Spinner } from "@/components/ui/spinner";

export interface PlanCard {
  id: string;
  n: number;
  label: string;
  title: string;
  hook: string;
  description: string;
  hashtags: string;
  skipped?: boolean;
}

const STYLE_TEXT: Record<string, string> = {
  daily: "Daily series",
  episodic: "Series · connected episodes",
  standalone: "Series · related videos",
};

/** Content setup step 1: the content concept (one video, or the series cards). Refine in the chat. */
export function PlanView({
  projectId,
  plan,
  cards,
  busy,
  stale,
  readOnly,
  auto,
}: {
  projectId: string;
  plan: { format?: string; style?: string; seriesTitle?: string; why?: string };
  cards: PlanCard[];
  busy: boolean;
  stale: boolean;
  /** Looking back at a finished step: no edits, no continue. */
  readOnly?: boolean;
  auto?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const working = busy && !stale;
  const series = plan.format === "series";
  const name = (c: PlanCard) => (series ? c.label || `#${c.n}` : "the video");
  const active = cards.filter((c) => !c.skipped).length;
  const act = (id: string, action: "skip" | "restore") => {
    const c = cards.find((x) => x.id === id);
    if (c) sentToChat(`${action === "skip" ? "⏭ Skip" : "↩️ Restore"} ${c.label ? `${c.label} · ` : ""}${c.title}`);
    return start(async () => {
      await api(`/api/contents/${id}/actions`, "POST", { action }).catch(() => undefined);
      router.refresh();
    });
  };

  if (working && !cards.length) {
    return (
      <div className="card pad setup-busy">
        <Spinner size={18} />
        <div>
          <div className="semibold">Planning your content…</div>
          <div className="xs muted">One video or a series, and the concept of each. Usually 20–40 seconds.</div>
        </div>
      </div>
    );
  }
  if (!cards.length) {
    // Project setup is locked and nothing is generated yet: a clear "ready" moment.
    return (
      <div className="card ready-card">
        <div className="ready-mark"><Sparkles size={20} /></div>
        <div>
          <h2 className="setup-title" style={{ margin: 0 }}>Your project is ready</h2>
          <p className="small muted line" style={{ marginTop: 6 }}>
            The project setup is locked — click the project name to see it. Next, I decide between one video or a series and write the concept of each: title, hook, description and hashtags.
          </p>
          <p className="xs muted" style={{ marginTop: 6 }}>Want something specific? Tell the agent first, e.g. “a 7-day series”.</p>
        </div>
        <button
          className="btn primary"
          disabled={pending}
          onClick={() => start(async () => { await api(`/api/projects/${projectId}/setup`, "POST", { action: "continue" }).catch(() => undefined); router.refresh(); })}
        >
          {pending ? <Spinner size={13} /> : <Sparkles size={14} />} Generate content
        </button>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="plan-head">
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>{series ? STYLE_TEXT[plan.style ?? ""] ?? "Series" : "Single video"}{series ? ` · ${cards.length} videos` : ""}</div>
          {series && plan.seriesTitle && <h2 className="setup-title" style={{ margin: 0 }}>{plan.seriesTitle}</h2>}
          {plan.why && <p className="small muted line" style={{ marginTop: 4 }}>{plan.why}</p>}
        </div>
        {working && <span className="pill blue"><Spinner size={11} /> Updating…</span>}
      </div>

      <div className={series ? "plan-grid" : "plan-single"}>
        {cards.map((c) => (
          <article
            key={c.id}
            className={`card plan-card ${working ? "dim" : ""} ${c.skipped ? "skipped" : ""} ${!readOnly && !c.skipped && !working ? "clickable-card" : ""}`}
            title={!readOnly && !c.skipped && !working ? "Click to change this content" : undefined}
            onClick={() => !readOnly && !c.skipped && !working && compose(`Change ${name(c)}: `)}
          >
            <div className="row between" style={{ gap: 8 }}>
              <span className="plan-label">{series ? c.label || `#${c.n}` : "Your video"}{c.skipped ? " · skipped" : ""}</span>
              {!readOnly && (
                <span className="row" style={{ gap: 4 }}>
                  {c.skipped ? (
                    <button className="btn small ghost" disabled={working || pending} onClick={(e) => { e.stopPropagation(); act(c.id, "restore"); }}><Undo2 size={12} /> Restore</button>
                  ) : (
                    active > 1 && series && (
                      <button className="btn small ghost" title="Skip — kept here, can be restored" disabled={working || pending} onClick={(e) => { e.stopPropagation(); act(c.id, "skip"); }}><SkipForward size={12} /> Skip</button>
                    )
                  )}
                </span>
              )}
            </div>
            <h3 className="plan-title">{c.title}</h3>
            <div className="plan-field">
              <span className="plan-k">Hook</span>
              <span className="plan-hook">“{c.hook}”</span>
            </div>
            {c.description && (
              <div className="plan-field">
                <span className="plan-k">Description</span>
                <span className="small line">{c.description}</span>
              </div>
            )}
            {c.hashtags && <div className="plan-tags">{c.hashtags}</div>}
          </article>
        ))}
      </div>

      {!readOnly && <div className="plan-foot">
        <button className="btn small soft" disabled={working} onClick={() => compose("Add 1 more content: ")}><Plus size={13} /> Add content</button>
        <div className="foot-actions">
        <InlineAuto projectId={projectId} field="autoApprove" initial={Boolean(auto)} hint="Auto: go on to the storyboards without stopping" />
        <button
          className="btn primary"
          disabled={working || pending}
          onClick={() => start(async () => { await api(`/api/projects/${projectId}/setup`, "POST", { action: "continue" }).catch(() => undefined); router.refresh(); })}
        >
          {pending ? <Spinner size={13} /> : null} Continue to storyboard{series ? "s" : ""} →
        </button>
        </div>
      </div>}
    </div>
  );
}
