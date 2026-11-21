"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ImageOff, Pencil, RotateCcw, SkipForward, Undo2 } from "lucide-react";
import type { Scene } from "@acs/domain";
import { api } from "@/lib/client/api";
import { compose } from "@/lib/client/compose";
import { Spinner } from "@/components/ui/spinner";

export interface StoryboardFrameView {
  status: "completed" | "failed" | "drawing" | "editing";
  url: string | null;
}

export interface StoryboardItem {
  id: string;
  n: number;
  label: string;
  title: string;
  hook: string;
  scenes: Scene[];
  frames: (StoryboardFrameView | undefined)[];
  status: "none" | "writing" | "ready" | "failed";
  skipped?: boolean;
  /** The script run's progress while writing (stage from WF-01). */
  writing?: { stage: string; progress: number } | null;
}

/** WF-01 stages → what the creator reads. The scene count is unknown until the script is done. */
const WRITING_STEPS = [
  { key: "queued", label: "Waiting to start" },
  { key: "understanding", label: "Reading the concept" },
  { key: "contents", label: "Writing the script & scenes" },
  { key: "editing", label: "Polishing the script" },
  { key: "saving", label: "Saving" },
];
const stepIndex = (stage?: string) => {
  const k = stage === "research" ? "understanding" : stage;
  const i = WRITING_STEPS.findIndex((s) => s.key === k);
  return i < 0 ? 0 : i;
};

/**
 * Content setup step 2: the storyboard of each video — every scene with its
 * image, narration and shot. Changes happen one scene at a time (✏️).
 */
export function StoryboardView({ projectId, items, series, readOnly }: { projectId: string; items: StoryboardItem[]; series: boolean; readOnly?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const retry = () =>
    start(async () => {
      await api(`/api/projects/${projectId}/setup`, "POST", { action: "retry" }).catch(() => undefined);
      router.refresh();
    });
  const act = (contentId: string, action: "skip" | "restore") =>
    start(async () => {
      await api(`/api/contents/${contentId}/actions`, "POST", { action }).catch(() => undefined);
      router.refresh();
    });
  const toVideo = () =>
    start(async () => {
      await api(`/api/projects/${projectId}/setup`, "POST", { action: "continue" }).catch(() => undefined);
      router.refresh();
    });
  const name = (it: StoryboardItem) => (series ? it.label || `#${it.n}` : "the video");
  const done = (it: StoryboardItem) =>
    it.status === "ready" && it.scenes.every((s, i) => s.background === "design" || ["completed", "failed"].includes(it.frames[i]?.status ?? ""));
  const live = items.filter((i) => !i.skipped);
  const ready = live.filter(done).length;

  return (
    <div className="stack" style={{ gap: 18 }}>
      {!readOnly && (
        <div className="sb-bar">
          <div className="sb-bar-info">
            <span className="small semibold">{ready < live.length ? `${ready} of ${live.length} storyboard${live.length > 1 ? "s" : ""} ready` : `${live.length} storyboard${live.length > 1 ? "s" : ""} ready`}</span>
            {series && <div className="progressbar" style={{ width: 140 }}><span style={{ width: `${(ready / Math.max(live.length, 1)) * 100}%` }} /></div>}
            <span className="xs muted sb-bar-hint">✏️ changes one scene · Skip sets a content aside</span>
          </div>
          <button className="btn primary" disabled={pending || !live.length || ready < live.length} onClick={toVideo}>
            {pending ? <Spinner size={13} /> : null} Continue to video →
          </button>
        </div>
      )}

      {items.map((it) => (
        <section key={it.id} className={`sb-sheet ${it.skipped ? "skipped" : ""}`}>
          <header className="sb-head">
            <div style={{ minWidth: 0 }}>
              {series && <span className="plan-label">{it.label || `#${it.n}`}{it.skipped ? " · skipped" : ""}</span>}
              <h3 className="sb-title">{it.title}</h3>
              <div className="sb-hook">“{it.hook}”</div>
            </div>
            {!readOnly && it.skipped && (
              <button className="btn small ghost" disabled={pending} onClick={() => act(it.id, "restore")}><Undo2 size={12} /> Restore</button>
            )}
            {!readOnly && !it.skipped && live.length > 1 && (
              <button className="btn small ghost" disabled={pending} title="Skip — kept here, can be restored; it won't be made into a video" onClick={() => act(it.id, "skip")}>
                <SkipForward size={12} /> Skip
              </button>
            )}
          </header>

          {/* Writing the script: one honest status (the scenes appear together when it's done) */}
          {!it.skipped && it.status === "writing" && !it.scenes.length && (
            <div className="sb-writing" aria-busy aria-live="polite">
              <div className="row" style={{ gap: 10 }}>
                <Spinner size={15} />
                <div>
                  <div className="small semibold">{WRITING_STEPS[stepIndex(it.writing?.stage)].label}…</div>
                  <div className="xs muted">The whole story is written in one go — all scenes appear together, then their images.</div>
                </div>
              </div>
              <ol className="sb-steps">
                {WRITING_STEPS.slice(1).map((st, i) => {
                  const at = stepIndex(it.writing?.stage);
                  return <li key={st.key} className={i + 1 < at ? "done" : i + 1 === at ? "now" : ""}>{st.label}</li>;
                })}
              </ol>
              <div className="progressbar"><span style={{ width: `${Math.max(it.writing?.progress ?? 4, 4)}%` }} /></div>
            </div>
          )}
          {!it.skipped && (it.status === "failed" || it.status === "none") && (
            <div className={`note ${it.status === "failed" ? "amber" : ""} row`} style={{ gap: 10 }}>
              {it.status === "failed" ? "This storyboard didn’t finish." : "No storyboard yet."}
              <button className="btn small" disabled={pending} onClick={retry}><RotateCcw size={12} /> {it.status === "failed" ? "Retry" : "Write storyboard"}</button>
            </div>
          )}

          {!it.skipped && it.scenes.length > 0 && it.status !== "none" && it.status !== "failed" && (
            <div className="sb-strip">
              {it.scenes.map((s, i) => {
                const f = it.frames[i];
                const busy = f?.status === "drawing" || f?.status === "editing" || (!f && s.background !== "design");
                return (
                  <figure key={i} className="sb-beat">
                    <SceneImage s={s} index={i} frame={f} busy={busy} />
                    <figcaption>
                      <div className="sb-beat-head">
                        <span className="sb-heading">{s.heading}</span>
                        {!readOnly && it.status === "ready" && !busy && (
                          <button className="icbtn tinybtn" title={`Change scene ${i + 1}`} onClick={() => compose(`Change ${name(it)} scene ${i + 1} (“${s.heading}”): `)}>
                            <Pencil size={10} />
                          </button>
                        )}
                      </div>
                      {s.narration && <p className="sb-narr">“{s.narration}”</p>}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          )}
        </section>
      ))}


    </div>
  );
}

/** The scene image; click to flip to its description. One side is drawn at a time. */
function SceneImage({ s, index, frame, busy }: { s: Scene; index: number; frame?: StoryboardFrameView; busy: boolean }) {
  const [back, setBack] = useState(false);
  const [touched, setTouched] = useState(false);
  const design = s.background === "design";
  return (
    <button
      type="button"
      className="sb-flip"
      onClick={() => {
        setTouched(true);
        setBack(!back);
      }}
      aria-pressed={back}
      aria-label={back ? `Show scene ${index + 1} image` : `Show scene ${index + 1} description`}
    >
      <span key={back ? "b" : "f"} className={`sb-img ${touched ? "anim" : ""} ${back ? "sb-back" : ""}`}>
        <span className="sb-num">{index + 1}</span>
        {back ? (
          <span className="sb-back-text">{s.visual || s.heading}</span>
        ) : frame?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={frame.url} alt={s.visual || s.heading} />
        ) : design ? (
          <span className="sb-design">{s.headline || s.onScreenText || s.heading}<small>designed scene</small></span>
        ) : frame?.status === "failed" ? (
          <span className="sb-loading"><ImageOff size={16} /> image failed</span>
        ) : null}
        {busy && !back && <span className="sb-overlay"><Spinner size={16} /> {frame?.status === "editing" ? "rewriting" : "drawing"}</span>}
        <span className="sb-secs">{s.seconds}s</span>
      </span>
    </button>
  );
}
