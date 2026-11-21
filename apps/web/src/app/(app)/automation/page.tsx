import Link from "next/link";
import { describeSchedule } from "@acs/domain";
import { PageHead } from "@/components/ui/empty";
import { LiveRefresh } from "@/components/ui/live-refresh";
import { fmtDateTime, pillClass, statusLabel, timeAgo } from "@/lib/format";
import type { ActivityRow, ProjectRow } from "@/lib/server/rows";
import { requireUser } from "@/lib/server/session";

export default async function AutomationPage() {
  const { supabase } = await requireUser();
  const [{ data: projects }, { data: activity }, { count: rendering }, { count: scheduled }, { data: runs }] = await Promise.all([
    supabase.from("projects").select("*").in("status", ["live", "paused", "draft"]).order("updated_at", { ascending: false }),
    supabase.from("activity_events").select("id, project_id, kind, message, created_at").order("created_at", { ascending: false }).limit(25),
    supabase.from("video_renders").select("id", { count: "exact", head: true }).in("status", ["queued", "rendering"]),
    supabase.from("publish_jobs").select("id", { count: "exact", head: true }).eq("status", "scheduled"),
    supabase.from("generation_runs").select("id, kind, status, stage, created_at, projects(title)").order("created_at", { ascending: false }).limit(10),
  ]);
  const list = (projects ?? []) as ProjectRow[];
  const active = list.filter((p) => p.status === "live");

  return (
    <main className="page">
      <LiveRefresh sources={[{ table: "projects" }, { table: "activity_events" }, { table: "generation_runs" }, { table: "video_renders" }]} />
      <PageHead eyebrow="MANAGE" title="Automation Center" text="Everything the workflows do on your behalf: generation, rendering and uploads." />
      <div className="manage-metrics">
        <div className="manage-metric"><span className="xs muted">Live projects</span><strong>{active.length}</strong><small>Publishing on schedule</small></div>
        <div className="manage-metric"><span className="xs muted">Rendering</span><strong>{rendering ?? 0}</strong><small>Videos in the queue</small></div>
        <div className="manage-metric"><span className="xs muted">Uploads scheduled</span><strong>{scheduled ?? 0}</strong><small>YouTube</small></div>
      </div>
      <div className="management-grid">
        <div className="stack">
          <div className="card pad">
            <div className="section"><h2>Project rules</h2></div>
            {list.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}?tab=schedule`} className="listrow rowclick" style={{ textDecoration: "none" }}>
                <div>
                  <div className="small semibold">{p.title}</div>
                  <div className="xs muted">Publishing {describeSchedule(p.schedule)}</div>
                </div>
                <span className={pillClass(p.status)}>{statusLabel(p.status)}</span>
              </Link>
            ))}
            {!list.length && <p className="small muted">No projects to automate yet.</p>}
          </div>
          <div className="card pad">
            <div className="section"><h2>Generation runs</h2></div>
            {(runs ?? []).map((r) => (
              <div key={r.id} className="listrow">
                <div><div className="small semibold">{(r.projects as unknown as { title: string } | null)?.title}</div><div className="xs muted">{r.kind === "ideation" ? "Recurring ideation" : "Project setup"} · {timeAgo(r.created_at)}</div></div>
                <span className={pillClass(r.status === "succeeded" ? "approved" : r.status === "failed" ? "failed" : "queued")}>{r.status}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card pad">
          <div className="section"><h2>Activity</h2></div>
          <div className="mini-timeline">
            {((activity ?? []) as ActivityRow[]).map((a) => (
              <div key={a.id} className="listrow"><span className="small">{a.message}</span><span className="xs faint">{timeAgo(a.created_at)}</span></div>
            ))}
            {!activity?.length && <p className="small muted">No activity yet.</p>}
          </div>
        </div>
      </div>
    </main>
  );
}
