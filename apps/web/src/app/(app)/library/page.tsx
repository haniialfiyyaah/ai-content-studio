import Link from "next/link";
import { resolveContent } from "@acs/domain";
import { EmptyState, PageHead } from "@/components/ui/empty";
import { VideoBox } from "@/components/ui/video-player";
import { fmtDate } from "@/lib/format";
import type { RenderRow } from "@/lib/server/rows";
import { signedVideoUrl } from "@/lib/server/renders";
import { requireUser } from "@/lib/server/session";

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  const { supabase } = await requireUser();
  const { data: projects } = await supabase.from("projects").select("id, title").order("title");
  let q = supabase.from("video_renders").select("*, contents(options, selection), projects(title)").eq("status", "ready").order("finished_at", { ascending: false }).limit(60);
  if (project) q = q.eq("project_id", project);
  const { data } = await q;
  const rows = await Promise.all(
    ((data ?? []) as (RenderRow & { contents: { options: never; selection: never } | null; projects: { title: string } | null })[]).map(async (r) => ({
      ...r,
      url: await signedVideoUrl(r.storage_path),
    })),
  );
  return (
    <main className="page">
      <PageHead eyebrow="MANAGE" title="Asset Library" text="Every finished video, private to your workspace, with the project it came from." />
      <div className="asset-filters">
        <Link href="/library" className={`asset-filter ${!project ? "active" : ""}`}>All projects</Link>
        {(projects ?? []).map((p) => <Link key={p.id} href={`/library?project=${p.id}`} className={`asset-filter ${project === p.id ? "active" : ""}`}>{p.title}</Link>)}
      </div>
      {rows.length ? (
        <div className="videogrid">
          {rows.map((r) => (
            <div key={r.id} className="video-card">
              <VideoBox url={r.url} status="ready" />
              <div className="small semibold">{resolveContent(r.contents?.options, r.contents?.selection).title}</div>
              <div className="xs muted">{r.projects?.title} · {fmtDate(r.finished_at)} · {r.steps.length} scenes · {r.model}</div>
            </div>
          ))}
        </div>
      ) : <EmptyState title="No finished videos yet" text="Rendered videos land here automatically." />}
    </main>
  );
}
