import Link from "next/link";
import { Check, ExternalLink, X } from "lucide-react";
import { OPTION_FIELDS, resolveContent, type Scene } from "@acs/domain";
import { OptionPicker } from "@/components/content/option-picker";
import { RenderControls } from "@/components/content/render-controls";
import { ActionButton } from "@/components/ui/action-button";
import { VideoBox } from "@/components/ui/video-player";
import { fmtDateTime, pillClass, statusLabel } from "@/lib/format";
import { STAGE_LABELS, type Stage } from "@/lib/pipeline";
import type { ContentRow, PublishJobRow } from "@/lib/server/rows";

type Render = { id: string; status: string; phase?: string | null; url?: string | null; error?: string | null } | null | undefined;

/**
 * Side panel for one content: shows only what its pipeline stage needs.
 * Server component; the actions are API buttons.
 */
export function ContentPanel({
  projectId,
  c,
  n,
  stage,
  render,
  job,
  images,
  drawing,
  editable,
  timezone,
}: {
  projectId: string;
  c: ContentRow;
  n: number;
  stage: Stage;
  render: Render;
  job: PublishJobRow | undefined;
  images: (string | null)[];
  drawing: boolean;
  editable: boolean;
  timezone?: string;
}) {
  const picked = resolveContent(c.options, c.selection);
  const actionPath = `/api/contents/${c.id}/actions`;
  const published = job?.status === "published" || job?.status === "publishing";
  const hasMedia = drawing || images.some(Boolean) || Boolean(render && !["failed", "cancelled"].includes(render.status));
  const scenes = (c.scenes ?? []) as Scene[];

  return (
    <aside className="panel" aria-label="Content details">
      <div className="panel-head">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>#{n} · {STAGE_LABELS[stage]}</div>
          <h2 className="panel-title">{picked.title}</h2>
        </div>
        <Link href={`/projects/${projectId}`} scroll={false} className="icbtn" aria-label="Close"><X size={15} /></Link>
      </div>

      <div className="panel-body">
        {/* Video first once it exists */}
        {(stage === "video" || stage === "publish") && (
          <div className="stack" style={{ gap: 10 }}>
            <div style={{ maxWidth: 220 }}><VideoBox url={render?.url} status={render?.status} phase={render?.phase} /></div>
            <RenderControls contentId={c.id} approved render={render ?? undefined} />
            {render?.status === "failed" && render.error && <span className="err">{render.error}</span>}
          </div>
        )}

        {stage === "publish" && job && (
          <div className="panel-section">
            <div className="kv"><label>Upload</label><span className={pillClass(job.status)}>{statusLabel(job.status)}</span></div>
            <div className="kv"><label>Slot</label><strong className="small">{fmtDateTime(job.scheduled_for, timezone)}</strong></div>
            {job.external_url && (
              <a className="btn small soft" href={job.external_url} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Open on YouTube</a>
            )}
            {job.error && <div className="note amber">{job.error}</div>}
          </div>
        )}

        {/* Ideas: pick the options */}
        {stage === "ideas" && (
          <div className="panel-section">
            <div className="xs muted">Pick the best option for each field — locked once approved.</div>
            {OPTION_FIELDS.map((f) => (
              <OptionPicker key={f} contentId={c.id} field={f} options={c.options[f] ?? []} selected={c.selection[f] ?? 0} disabled={!editable} preview={f === "script" || f === "hook"} />
            ))}
          </div>
        )}

        {/* Scene images (storyboard drawn on approve) */}
        {stage !== "ideas" && (
          <div className="panel-section">
            <div className="row between">
              <span className="xs semibold">Scenes · {scenes.length}</span>
              {editable && !published && (
                <ActionButton
                  path={actionPath}
                  body={{ action: "storyboard" }}
                  className="btn small ghost"
                  disabled={drawing}
                  confirm={images.some(Boolean) ? "Redraw every scene image? This uses image credits again." : undefined}
                >
                  {drawing ? "Drawing…" : images.some(Boolean) ? "Redraw images" : "Draw images"}
                </ActionButton>
              )}
            </div>
            <div className="panel-frames">
              {scenes.map((s, i) => (
                <div key={i} className="panel-frame">
                  {images[i] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={images[i]!} alt={s.heading} />
                  ) : (
                    <div className={`panel-frame-empty ${drawing ? "pulse" : ""}`}>{s.background === "design" ? "Design" : drawing ? "…" : i + 1}</div>
                  )}
                  <div className="tiny panel-frame-cap">{s.heading}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* The script, as scenes (ideas: what will be made) */}
        <details className="panel-section" open={stage === "ideas"}>
          <summary className="xs semibold">Script & scenes</summary>
          <div className="stack" style={{ gap: 8, marginTop: 8 }}>
            {scenes.map((s, i) => (
              <div key={i} className="panel-scene">
                <div className="tiny muted">{i + 1} · {s.layout} · {s.seconds}s</div>
                <div className="small semibold">{s.heading}</div>
                {s.narration && <div className="xs muted line">{s.narration}</div>}
              </div>
            ))}
          </div>
        </details>
      </div>

      {editable && !published && (
        <div className="panel-foot">
          {stage === "ideas" ? (
            <>
              <ActionButton path={actionPath} body={{ action: "approve" }} className="btn primary"><Check size={14} /> Approve</ActionButton>
              <ActionButton path={actionPath} body={{ action: "remove" }} className="btn ghost" redirectTo={`/projects/${projectId}`}>🗑 Remove</ActionButton>
            </>
          ) : (
            <>
              {stage === "video" && render?.status === "ready" && (
                <ActionButton path={actionPath} body={{ action: "publish" }} className="btn soft" confirm="Upload this video to YouTube now?">🚀 Publish now</ActionButton>
              )}
              {hasMedia ? (
                <>
                  <ActionButton path={actionPath} body={{ action: c.on_hold ? "resume" : "hold" }} className="btn ghost">{c.on_hold ? "▶ Resume" : "⏸ Hold"}</ActionButton>
                  <ActionButton path={actionPath} body={{ action: "remove" }} className="btn ghost" confirm="Reject this content? Its images and video are discarded and it won't be published." redirectTo={`/projects/${projectId}`}>✕ Reject</ActionButton>
                </>
              ) : (
                <ActionButton path={actionPath} body={{ action: "remove" }} className="btn ghost" redirectTo={`/projects/${projectId}`}>🗑 Remove</ActionButton>
              )}
              <ActionButton path={actionPath} body={{ action: "unlock" }} className="btn ghost" title="Back to Ideas to change options">🔓 Unlock</ActionButton>
            </>
          )}
          <Link href={`/projects/${projectId}/content/${c.id}`} className="btn ghost small" style={{ marginLeft: "auto" }}>Full details →</Link>
        </div>
      )}
    </aside>
  );
}
