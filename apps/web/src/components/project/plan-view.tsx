"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Pencil, RotateCcw } from "lucide-react";
import { api } from "@/lib/client/api";
import { compose } from "@/lib/client/compose";
import { Spinner } from "@/components/ui/spinner";

export interface PlanCard {
  id: string;
  n: number;
  label: string;
  title: string;
  hook: string;
  description: string;
  hashtags: string;
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
}: {
  projectId: string;
  plan: { format?: string; style?: string; seriesTitle?: string; why?: string };
  cards: PlanCard[];
  busy: boolean;
  stale: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const working = busy && !stale;
  const series = plan.format === "series";
  const name = (c: PlanCard) => (series ? c.label || `#${c.n}` : "the video");

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
    return (
      <div className="note amber row" style={{ gap: 10 }}>
        The content plan didn&apos;t finish.
        <button
          className="btn small"
          disabled={pending}
          onClick={() => start(async () => { await api(`/api/projects/${projectId}/setup`, "POST", { action: "retry" }).catch(() => undefined); router.refresh(); })}
        >
          <RotateCcw size={12} /> Retry
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
          <article key={c.id} className={`card plan-card ${working ? "dim" : ""}`}>
            <div className="row between" style={{ gap: 8 }}>
              <span className="plan-label">{series ? c.label || `#${c.n}` : "Your video"}</span>
              <button className="icbtn tinybtn" title={`Change ${name(c)}`} disabled={working} onClick={() => compose(`Change ${name(c)}: `)}>
                <Pencil size={11} />
              </button>
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

      <div className="plan-foot">
        <span className="xs muted">Check {series ? "the videos" : "the video"} and tell the agent anything to change — ✏️ pre-fills it.</span>
        <button
          className="btn primary"
          disabled={working || pending}
          onClick={() => start(async () => { await api(`/api/projects/${projectId}/setup`, "POST", { action: "continue" }).catch(() => undefined); router.refresh(); })}
        >
          {pending ? <Spinner size={13} /> : null} Continue to storyboard{series ? "s" : ""} →
        </button>
      </div>
    </div>
  );
}
