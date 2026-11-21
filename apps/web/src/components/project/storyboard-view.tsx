"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Pencil, RotateCcw } from "lucide-react";
import type { Scene } from "@acs/domain";
import { api } from "@/lib/client/api";
import { compose } from "@/lib/client/compose";
import { SketchFrame } from "./sketch-frame";

export interface StoryboardItem {
  id: string;
  n: number;
  label: string;
  title: string;
  hook: string;
  script: string;
  scenes: Scene[];
  status: "none" | "writing" | "ready" | "failed";
}

/**
 * Content setup step 2: the storyboard of each video — sketch frames (free,
 * drawn from the scenes), narration under each, the full script. Refine in chat.
 */
export function StoryboardView({ projectId, items, series, fontClass }: { projectId: string; items: StoryboardItem[]; series: boolean; fontClass: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const retry = () =>
    start(async () => {
      await api(`/api/projects/${projectId}/setup`, "POST", { action: "retry" }).catch(() => undefined);
      router.refresh();
    });
  const name = (it: StoryboardItem) => (series ? it.label || `#${it.n}` : "the video");
  const ready = items.filter((i) => i.status === "ready").length;

  return (
    <div className={`stack sb ${fontClass}`} style={{ gap: 18 }}>
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
            {it.status === "ready" && (
              <button className="btn small ghost" onClick={() => compose(`Change ${name(it)}: `)}><Pencil size={12} /> Change</button>
            )}
          </header>

          {it.status === "writing" && (
            <div className="sb-strip" aria-busy>
              {Array.from({ length: 6 }, (_, i) => <div key={i} className="sk-frame sk-pending" style={{ animationDelay: `${i * 120}ms` }}><span className="sk-num">{i + 1}</span></div>)}
              <div className="sb-note">sketching the scenes…</div>
            </div>
          )}
          {(it.status === "failed" || it.status === "none") && (
            <div className="note amber row" style={{ gap: 10 }}>
              This storyboard didn&apos;t finish.
              <button className="btn small" disabled={pending} onClick={retry}><RotateCcw size={12} /> Retry</button>
            </div>
          )}

          {it.status === "ready" && (
            <>
              <div className="sb-strip">
                {it.scenes.map((s, i) => (
                  <figure key={i} className="sb-beat">
                    <SketchFrame s={s} index={i} />
                    <figcaption>
                      <div className="sb-beat-head">
                        <span className="sb-hand">{s.heading}</span>
                        <button className="icbtn tinybtn" title={`Change scene ${i + 1}`} onClick={() => compose(`Change ${name(it)} scene ${i + 1} (“${s.heading}”): `)}>
                          <Pencil size={10} />
                        </button>
                      </div>
                      {s.narration && <p className="sb-narr">{s.narration}</p>}
                    </figcaption>
                  </figure>
                ))}
              </div>
              {it.script && (
                <details className="sb-script">
                  <summary className="xs semibold">Full script · {it.scenes.reduce((a, s) => a + (s.seconds || 0), 0)} s</summary>
                  <p className="small line">{it.script}</p>
                </details>
              )}
            </>
          )}
        </section>
      ))}

      <div className="note">
        Check {series ? "the storyboards" : "the storyboard"} and tell the agent anything to change — tap ✏️ on a scene to point at it. Next step: images &amp; video.
      </div>
    </div>
  );
}
