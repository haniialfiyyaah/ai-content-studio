import Link from "next/link";
import { Download } from "lucide-react";
import { resolveContent } from "@acs/domain";
import { ActionButton } from "@/components/ui/action-button";
import { EmptyState, PageHead } from "@/components/ui/empty";
import { LiveRefresh } from "@/components/ui/live-refresh";
import { VideoBox } from "@/components/ui/video-player";
import { pillClass, timeAgo } from "@/lib/format";
import type { RenderRow } from "@/lib/server/rows";
import { signVideos } from "@/lib/server/queries";
import { requireUser } from "@/lib/server/session";

export default async function VideosPage() {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("video_renders")
    .select("*, contents(options, selection), projects(title)")
    .order("created_at", { ascending: false })
    .limit(60);
  const rows = (data ?? []) as (RenderRow & { contents: { options: never; selection: never } | null; projects: { title: string } | null })[];
  const urls = await signVideos(rows.filter((r) => r.status === "ready" && r.storage_path).map((r) => r.storage_path!));
  const withUrls = rows.map((r) => ({ ...r, url: r.storage_path ? urls.get(r.storage_path) ?? null : null }));
  const counts = (s: string) => rows.filter((r) => r.status === s).length;

  return (
    <main className="page">
      <LiveRefresh sources={[{ table: "video_renders" }]} />
      <PageHead eyebrow="WORKSPACE" title="Videos" text="Each scene gets an image, then everything is composed into a captioned, narrated Short. Download any finished video. Updates live." />
      <div className="manage-metrics">
        {[["Ready", counts("ready")], ["Rendering", counts("rendering")], ["Queued", counts("queued")], ["Failed", counts("failed")]].map(([l, v]) => (
          <div key={l} className="manage-metric"><span className="xs muted">{l}</span><strong>{v}</strong><small>videos</small></div>
        ))}
      </div>
      {withUrls.length ? (
        <div className="videogrid">
          {withUrls.map((r) => (
            <div key={r.id} className="video-card">
              <VideoBox url={r.url} status={r.status} phase={r.phase} />
              <Link href={`/videos/${r.id}`} className="small semibold" style={{ textDecoration: "none" }}>{resolveContent(r.contents?.options, r.contents?.selection).title} →</Link>
              <div className="row between">
                <Link href={`/projects/${r.project_id}?c=${r.content_id}`} className="xs muted">{r.projects?.title}</Link>
                <span className={pillClass(r.status)}>{r.status}</span>
              </div>
              <div className="row between">
                <span className="tiny faint">{timeAgo(r.updated_at)}</span>
                {r.status === "failed" && <ActionButton path={`/api/renders/${r.id}/retry`} className="btn small soft">Retry</ActionButton>}
                {r.status === "ready" && <a className="btn small primary" href={`/api/renders/${r.id}/download`}><Download size={13} /> Download</a>}
              </div>
            </div>
          ))}
        </div>
      ) : <EmptyState title="No videos yet" text="Activate a project and its approved content is rendered automatically." />}
    </main>
  );
}
