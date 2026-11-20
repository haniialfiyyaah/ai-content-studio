import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Clock, Download, ExternalLink, RotateCcw, X } from "lucide-react";
import { resolveContent } from "@acs/domain";
import { ActionButton } from "@/components/ui/action-button";
import { LiveRefresh } from "@/components/ui/live-refresh";
import { VideoBox } from "@/components/ui/video-player";
import { fmtDateTime, pillClass, statusLabel, timeAgo } from "@/lib/format";
import { sceneImageUrls, signVideos } from "@/lib/server/queries";
import type { ContentRow, ProjectRow, PublishJobRow, RenderRow } from "@/lib/server/rows";
import { requireUser } from "@/lib/server/session";

type Render = RenderRow & { download_count: number; last_downloaded_at: string | null; duration_seconds: number | null };

/** Video detail: player, status, schedule/publishing, downloads, scenes and history. */
export default async function VideoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("video_renders").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const r = data as Render;

  const [{ data: content }, { data: project }, { data: job }, { data: history }, { data: profile }] = await Promise.all([
    supabase.from("contents").select("*").eq("id", r.content_id).single(),
    supabase.from("projects").select("*").eq("id", r.project_id).single(),
    supabase.from("publish_jobs").select("*").eq("content_id", r.content_id).maybeSingle(),
    supabase.from("video_renders").select("id, status, created_at, finished_at, error").eq("content_id", r.content_id).order("created_at", { ascending: false }).limit(10),
    supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle(),
  ]);
  const c = content as ContentRow;
  const p = project as ProjectRow;
  const j = job as PublishJobRow | null;
  const tz = p.schedule?.timezone ?? profile?.timezone ?? "Asia/Jakarta";
  const picked = resolveContent(c.options, c.selection);
  const [urls, scenes] = await Promise.all([
    r.status === "ready" && r.storage_path ? signVideos([r.storage_path]) : Promise.resolve(new Map<string, string>()),
    sceneImageUrls(r.steps),
  ]);
  const url = r.storage_path ? urls.get(r.storage_path) ?? null : null;
  const isLatest = history?.[0]?.id === r.id;

  // Lifecycle timeline
  const steps: { label: string; detail: string; state: "done" | "current" | "todo" | "failed" }[] = [
    { label: "Rendered", detail: r.status === "ready" ? fmtDateTime(r.finished_at, tz) : r.status === "failed" ? r.error ?? "Failed" : statusLabel(r.status), state: r.status === "ready" ? "done" : r.status === "failed" ? "failed" : "current" },
    {
      label: "Scheduled",
      detail: j ? `${fmtDateTime(j.scheduled_for, tz)} · YouTube` : p.status === "active" ? "Waiting for a slot" : "Not scheduled — set a schedule and activate the project",
      state: j ? "done" : "todo",
    },
    {
      label: "Published",
      detail: j?.status === "published" ? fmtDateTime(j.published_at, tz) : j?.status === "failed" ? j.error ?? "Upload failed" : j?.status === "publishing" ? "Uploading now…" : "—",
      state: j?.status === "published" ? "done" : j?.status === "failed" ? "failed" : j?.status === "publishing" ? "current" : "todo",
    },
    {
      label: "Downloaded",
      detail: r.download_count ? `${r.download_count}× · last ${timeAgo(r.last_downloaded_at!)}` : "Not downloaded yet",
      state: r.download_count ? "done" : "todo",
    },
  ];
  const icon = (s: string) => (s === "done" ? <Check size={12} /> : s === "failed" ? <X size={12} /> : <Clock size={12} />);

  return (
    <main className="page">
      <LiveRefresh sources={[{ table: "video_renders", filter: `content_id=eq.${r.content_id}` }, { table: "publish_jobs", filter: `content_id=eq.${r.content_id}` }]} />
      <div className="row xs muted" style={{ marginBottom: 18, flexWrap: "wrap" }}>
        <Link href="/videos" className="row semibold" style={{ color: "var(--text)", textDecoration: "none" }}><ArrowLeft size={15} /> Videos</Link>
        <span>/ <Link href={`/projects/${p.id}?tab=videos`}>{p.title}</Link></span>
      </div>

      <div className="detailhead" style={{ marginBottom: 20 }}>
        <div>
          <div className="eyebrow">VIDEO {isLatest ? "" : "· OLDER VERSION"}</div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <h1>{picked.title}</h1>
            <span className={pillClass(j?.status === "published" ? "published" : r.status)}>{j?.status === "published" ? "Published" : statusLabel(r.status)}</span>
          </div>
          <p>{picked.hook}</p>
        </div>
        <div className="actions">
          {r.status === "ready" && <a className="btn primary" href={`/api/renders/${r.id}/download`}><Download size={14} /> Download</a>}
          {j?.external_url && <a className="btn" href={j.external_url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> YouTube</a>}
          {r.status === "failed" && <ActionButton path={`/api/renders/${r.id}/retry`} className="btn primary"><RotateCcw size={14} /> Retry</ActionButton>}
          {r.status === "ready" && c.status === "approved" && (
            <ActionButton path={`/api/contents/${c.id}/render`} className="btn" confirm="Render a new version? Its images are generated again.">
              <RotateCcw size={14} /> Re-render
            </ActionButton>
          )}
        </div>
      </div>

      <div className="grid split-media">
        <VideoBox url={url} status={r.status} phase={r.phase} />
        <div className="stack">
          <div className="card pad">
            <div className="section"><h2>Status</h2></div>
            <div className="checks">
              {steps.map((s) => (
                <div key={s.label} className="checkrow">
                  <span className={`checkdot ${s.state === "done" ? "done" : ""}`} style={s.state === "failed" ? { background: "#fdecec", color: "#c43d3d" } : undefined}>{icon(s.state)}</span>
                  <div><div className="semibold">{s.label}</div><div className="xs muted">{s.detail}</div></div>
                </div>
              ))}
            </div>
          </div>
          <div className="card pad">
            <div className="section"><h2>Details</h2><Link className="linklike" href={`/projects/${p.id}/content/${c.id}`}>Content →</Link></div>
            <div className="kv"><label>Project</label><Link className="small semibold" href={`/projects/${p.id}`}>{p.title}</Link></div>
            <div className="kv"><label>Length</label><strong>{r.duration_seconds ? `${Math.round(Number(r.duration_seconds))} s` : "—"}</strong></div>
            <div className="kv"><label>Beats</label><strong>{r.steps.length || c.scenes.length}</strong></div>
            <div className="kv"><label>Images</label><span className="small">{r.provider?.replace(/\+remotion$/, "") || "—"}{r.model ? ` · ${r.model}` : ""}</span></div>
            <div className="kv"><label>Narration</label><strong>{r.narration_path ? "Voice-over" : "Captions only"}</strong></div>
            <div className="kv"><label>Created</label><span className="small">{fmtDateTime(r.created_at, tz)}</span></div>
          </div>
        </div>
      </div>

      {scenes.some(Boolean) && (
        <div className="card pad" style={{ marginTop: 18 }}>
          <div className="section"><h2>Scene images</h2></div>
          <div className="videogrid">
            {c.scenes.map((s, i) => (
              <div key={i} className="assetcard">
                <div className="assetvisual" style={{ padding: 0, overflow: "hidden", height: 200 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {scenes[i] ? <img src={scenes[i]!} alt={s.heading} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "🎨"}
                </div>
                <div className="xs muted" style={{ padding: "8px 4px 2px" }}>#{i + 1} · {s.layout ?? "image"}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(history?.length ?? 0) > 1 && (
        <div className="card pad" style={{ marginTop: 18 }}>
          <div className="section"><h2>Versions</h2></div>
          {history!.map((h) => (
            <Link key={h.id} href={`/videos/${h.id}`} className="listrow rowclick" style={{ textDecoration: "none" }}>
              <span className="small">{fmtDateTime(h.created_at, tz)}{h.id === r.id ? " · viewing" : ""}</span>
              <span className={pillClass(h.status)}>{statusLabel(h.status)}</span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
