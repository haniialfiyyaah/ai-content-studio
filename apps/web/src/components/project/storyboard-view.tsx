"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ImageOff, Pencil, RotateCcw } from "lucide-react";
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
}

/**
 * Content setup step 2: the storyboard of each video — every scene with its
 * image, narration and shot. Changes happen one scene at a time (✏️).
 */
export function StoryboardView({ projectId, items, series }: { projectId: string; items: StoryboardItem[]; series: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const retry = () =>
    start(async () => {
      await api(`/api/projects/${projectId}/setup`, "POST", { action: "retry" }).catch(() => undefined);
      router.refresh();
    });
  const name = (it: StoryboardItem) => (series ? it.label || `#${it.n}` : "the video");
  const done = (it: StoryboardItem) =>
    it.status === "ready" && it.scenes.every((s, i) => s.background === "design" || ["completed", "failed"].includes(it.frames[i]?.status ?? ""));
  const ready = items.filter(done).length;

  return (
    <div className="stack" style={{ gap: 18 }}>
      {series && (
        <div className="sb-progress">
          <span className="small semibold">{ready} of {items.length} storyboards</span>
          <div className="progressbar" style={{ flex: 1, maxWidth: 220 }}><span style={{ width: `${(ready / Math.max(items.length, 1)) * 100}%` }} /></div>
        </div>
      )}

      {items.map((it) => (
        <section key={it.id} className="sb-sheet">
          <header className="sb-head">
            <div style={{ minWidth: 0 }}>
              {series && <span className="plan-label">{it.label || `#${it.n}`}</span>}
              <h3 className="sb-title">{it.title}</h3>
              <div className="sb-hook">“{it.hook}”</div>
            </div>
          </header>

          {it.status === "writing" && !it.scenes.length && (
            <div className="sb-strip" aria-busy>
              {Array.from({ length: 6 }, (_, i) => (
                <figure key={i} className="sb-beat">
                  <div className="sb-img sb-pending" style={{ animationDelay: `${i * 120}ms` }}>
                    <span className="sb-num">{i + 1}</span>
                    <span className="sb-loading"><Spinner size={14} /> writing</span>
                  </div>
                </figure>
              ))}
            </div>
          )}
          {(it.status === "failed" || it.status === "none") && (
            <div className="note amber row" style={{ gap: 10 }}>
              This storyboard didn&apos;t finish.
              <button className="btn small" disabled={pending} onClick={retry}><RotateCcw size={12} /> Retry</button>
            </div>
          )}

          {it.scenes.length > 0 && it.status !== "none" && it.status !== "failed" && (
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
                        {it.status === "ready" && !busy && (
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

      <div className="note">Tap ✏️ on a scene to change it — only that scene is rewritten and redrawn. Next step: the video.</div>
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
