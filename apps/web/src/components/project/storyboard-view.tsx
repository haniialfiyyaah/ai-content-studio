"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Clapperboard, ImageOff, Plus, RotateCcw, SkipForward, Undo2 } from "lucide-react";
import type { Scene } from "@acs/domain";
import { api } from "@/lib/client/api";
import { compose, sentToChat } from "@/lib/client/compose";
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
  /** Its video, once "Make this video" / "Create all videos" started it. */
  video?: { status: string; phase?: string | null } | null;
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
 * image, narration and shot. Click a scene to change it; click a title to change all its scenes.
 */
export function StoryboardView({
  projectId,
  items,
  series,
  readOnly,
}: {
  projectId: string;
  items: StoryboardItem[];
  series: boolean;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const retry = () =>
    start(async () => {
      await api(`/api/projects/${projectId}/setup`, "POST", { action: "retry" }).catch(() => undefined);
      router.refresh();
    });
  const act = (contentId: string, action: "skip" | "restore" | "make_video" | "draw_missing") => {
    const it = items.find((x) => x.id === contentId);
    if (it && (action === "skip" || action === "restore")) sentToChat(`${action === "skip" ? "⏭ Skip" : "↩️ Restore"} ${it.label ? `${it.label} · ` : ""}${it.title}`);
    return start(async () => {
      await api(`/api/contents/${contentId}/actions`, "POST", { action }).catch(() => undefined);
      router.refresh();
    });
  };
  const toVideo = () =>
    start(async () => {
      await api(`/api/projects/${projectId}/setup`, "POST", { action: "continue" }).catch(() => undefined);
      router.refresh();
    });
  const canChange = (it: StoryboardItem) => !readOnly && !it.skipped && it.status === "ready" && !it.video;
  const name = (it: StoryboardItem) => (series ? it.label || `#${it.n}` : "the video");
  const done = (it: StoryboardItem) =>
    it.status === "ready" && it.scenes.every((s, i) => s.background === "design" || ["completed", "failed"].includes(it.frames[i]?.status ?? ""));
  const live = items.filter((i) => !i.skipped);
  const ready = live.filter(done).length;
  const made = live.filter((i) => i.video && ["queued", "rendering", "ready"].includes(i.video.status)).length;

  return (
    <div className="stack" style={{ gap: 18 }}>
      {!readOnly && (
        <div className="sb-bar">
          <div className="sb-bar-info">
            <span className="small semibold">{ready < live.length ? `${ready} of ${live.length} storyboard${live.length > 1 ? "s" : ""} ready` : `${live.length} storyboard${live.length > 1 ? "s" : ""} ready`}</span>
            {series && <div className="progressbar" style={{ width: 140 }}><span style={{ width: `${(ready / Math.max(live.length, 1)) * 100}%` }} /></div>}
            <button className="btn small soft" onClick={() => compose("Add 1 more content: ")}><Plus size={12} /> Add content</button>
          </div>
          <div className="foot-actions">
            <button className="btn primary" disabled={pending || !live.length || ready < live.length} onClick={toVideo}>
              {pending ? <Spinner size={13} /> : <Clapperboard size={14} />}{" "}
              {made > 0 && made < live.length ? `Ready — create the other ${live.length - made} video${live.length - made > 1 ? "s" : ""}` : `Ready — create all video${live.length > 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      )}

      {items.map((it) => (
        <section key={it.id} className={`sb-sheet ${it.skipped ? "skipped" : ""}`}>
          <header className="sb-head">
            {/* Click the title to change every scene of this video (the concept stays). */}
            <div
              style={{ minWidth: 0 }}
              className={canChange(it) || readOnly ? "sb-title-click" : ""}
              role={canChange(it) || readOnly ? "button" : undefined}
              tabIndex={canChange(it) || readOnly ? 0 : undefined}
              title={readOnly ? "Open the content details" : canChange(it) ? "Click to change all scenes of this video" : undefined}
              onClick={() => {
                if (readOnly) router.push(`/projects/${projectId}/content/${it.id}`);
                else if (canChange(it)) compose(`Change ${name(it)} (all scenes): `);
              }}
            >
              {series && <span className="plan-label">{it.label || `#${it.n}`}{it.skipped ? " · skipped" : ""}</span>}
              <h3 className="sb-title">{it.title}</h3>
              <div className="sb-hook">“{it.hook}”</div>
            </div>
            {!readOnly && (
              <div className="sb-head-actions">
                {it.skipped ? (
                  <button className="btn small ghost" disabled={pending} onClick={() => act(it.id, "restore")}><Undo2 size={12} /> Restore</button>
                ) : (
                  <>
                    {!it.video && it.status === "ready" && it.frames.some((f) => f?.status === "failed") && (
                      <button className="btn small soft" disabled={pending} title="Draw only the scenes whose image failed" onClick={() => act(it.id, "draw_missing")}>
                        <RotateCcw size={12} /> Draw missing images
                      </button>
                    )}
                    {it.video && ["queued", "rendering", "ready"].includes(it.video.status) ? (
                      <span className={`pill ${it.video.status === "ready" ? "approved" : "blue"}`}>
                        {it.video.status === "ready" ? "🎬 Video ready" : it.video.phase === "compose" ? "Composing video…" : "Making video…"}
                      </span>
                    ) : (
                      done(it) && (
                        <button className="btn small soft" disabled={pending} title="Make only this video now" onClick={() => act(it.id, "make_video")}>
                          <Clapperboard size={12} /> Make this video
                        </button>
                      )
                    )}
                    {live.length > 1 && !it.video && (
                      <button className="btn small ghost" disabled={pending} title="Skip — kept here, can be restored; it won't be made into a video" onClick={() => act(it.id, "skip")}>
                        <SkipForward size={12} /> Skip
                      </button>
                    )}
                  </>
                )}
              </div>
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
                  <figure
                    key={i}
                    className={`sb-beat ${canChange(it) && !busy ? "sb-beat-click" : ""}`}
                    onClick={(e) => {
                      // the image handles its own click
                      if ((e.target as HTMLElement).closest(".sb-flip")) return;
                      if (canChange(it) && !busy) compose(`Change ${name(it)} scene ${i + 1} (“${s.heading}”): `);
                    }}
                  >
                    <SceneImage
                      s={s}
                      index={i}
                      frame={f}
                      busy={busy}
                      onPick={canChange(it) && !busy ? () => compose(`Change ${name(it)} scene ${i + 1} (“${s.heading}”): `) : undefined}
                    />
                    <figcaption>
                      <div className="sb-beat-head">
                        <span className="sb-heading">{s.heading}</span>
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
function SceneImage({ s, index, frame, busy, onPick }: { s: Scene; index: number; frame?: StoryboardFrameView; busy: boolean; onPick?: () => void }) {
  const [back, setBack] = useState(false);
  const [touched, setTouched] = useState(false);
  const design = s.background === "design";
  return (
    <button
      type="button"
      className="sb-flip"
      onMouseEnter={(e) => {
        if (e.nativeEvent instanceof MouseEvent && window.matchMedia("(hover: hover)").matches) {
          setTouched(true);
          setBack(true);
        }
      }}
      onMouseLeave={() => {
        if (window.matchMedia("(hover: hover)").matches) setBack(false);
      }}
      onClick={() => onPick?.()}
      title={onPick ? "Click to change this scene" : undefined}
      aria-label={onPick ? `Change scene ${index + 1}` : `Scene ${index + 1}`}
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
