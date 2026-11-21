import { Download, RotateCcw } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";

export interface VideoItem {
  id: string;
  n: number;
  label: string;
  title: string;
  render: { id: string; status: string; phase?: string | null; url?: string | null; error?: string | null } | null;
  scheduled?: boolean;
  published?: boolean;
}

/** Steps a render goes through, in the creator's words. */
const STEPS = [
  { key: "queued", label: "Waiting for the studio" },
  { key: "assets", label: "Preparing voice & images" },
  { key: "compose", label: "Composing the video" },
  { key: "ready", label: "Ready" },
];
const stepOf = (r: VideoItem["render"]) =>
  !r || r.status === "queued" ? 0 : r.status === "ready" ? 3 : r.phase === "compose" ? 2 : 1;

/** Content step 3: every video rendering, then playable and downloadable. */
export function VideoView({ items, series }: { items: VideoItem[]; series: boolean }) {
  const ready = items.filter((i) => i.render?.status === "ready").length;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="sb-progress">
        <span className="small semibold">{ready} of {items.length} video{items.length > 1 ? "s" : ""} ready</span>
        <div className="progressbar" style={{ flex: 1, maxWidth: 220 }}><span style={{ width: `${(ready / Math.max(items.length, 1)) * 100}%` }} /></div>
      </div>

      <div className="vid-grid">
        {items.map((it) => {
          const r = it.render;
          const at = stepOf(r);
          const failed = r?.status === "failed" || r?.status === "cancelled";
          return (
            <article key={it.id} className="card vid-card">
              <div className="vid-frame">
                {r?.status === "ready" && r.url ? (
                  <video src={r.url} controls playsInline preload="metadata" />
                ) : (
                  <div className={`vid-wait ${failed ? "failed" : ""}`}>
                    {!failed && <span className="vid-pulse" aria-hidden />}
                    <span className="small semibold">{failed ? "Render failed" : STEPS[at].label}…</span>
                    {!failed && (
                      <ol className="vid-steps">
                        {STEPS.slice(0, 3).map((s, i) => <li key={s.key} className={i < at ? "done" : i === at ? "now" : ""} />)}
                      </ol>
                    )}
                  </div>
                )}
              </div>
              <div className="vid-body">
                <div className="row" style={{ gap: 6 }}>
                  {series && <span className="plan-label">{it.label || `#${it.n}`}</span>}
                  {r?.status === "ready" && <span className="pill approved">{it.published ? "Published" : it.scheduled ? "Scheduled" : "Video ready"}</span>}
                </div>
                <h3 className="vid-title">{it.title}</h3>
                {failed && r?.error && <div className="xs err">{r.error}</div>}
                <div className="actions" style={{ gap: 6 }}>
                  {r?.status === "ready" && (
                    <a className="btn small primary" href={`/api/renders/${r.id}/download`}><Download size={13} /> Download</a>
                  )}
                  {failed && r && (
                    <ActionButton path={`/api/renders/${r.id}/retry`} className="btn small soft"><RotateCcw size={13} /> Retry</ActionButton>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <div className="note">Videos render one after another on the studio server. Publishing comes next.</div>
    </div>
  );
}
