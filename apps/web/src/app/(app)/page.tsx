import Link from "next/link";
import { ArrowRight, FileText, Film, Folder, Zap } from "lucide-react";
import { describeSchedule } from "@acs/domain";
import { StartProject } from "@/components/overview/start-project";
import { ProjectCard } from "@/components/project/project-card";
import { LiveRefresh } from "@/components/ui/live-refresh";
import { fmtDateTime } from "@/lib/format";
import type { ProjectRow } from "@/lib/server/rows";
import { requireUser } from "@/lib/server/session";
import { SAVED_PROJECTS_FILTER, projectSignals } from "@/lib/server/signals";

export default async function OverviewPage() {
  const { supabase, user } = await requireUser();
  const [{ data: profile }, { data: projects }, { count: toReview }, { count: videosReady }, { data: nextJob }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    supabase.from("projects").select("*").or(SAVED_PROJECTS_FILTER).neq("status", "archived").order("updated_at", { ascending: false }).limit(24),
    supabase.from("contents").select("id", { count: "exact", head: true }).eq("status", "idea"),
    supabase.from("video_renders").select("id", { count: "exact", head: true }).eq("status", "ready"),
    supabase.from("publish_jobs").select("scheduled_for").eq("status", "scheduled").order("scheduled_for").limit(1).maybeSingle(),
  ]);
  const list = (projects ?? []) as ProjectRow[];
  const active = list.filter((p) => p.status === "live");
  const signals = await projectSignals(supabase, list);
  const needs = (p: ProjectRow) => signals.get(p.id)?.needsYou ?? 0;
  const attention = [
    ...list.filter((p) => p.status === "setup" && needs(p)).map((p) => ({ p, text: "Setup is waiting for you", icon: "" })),
    ...list.filter((p) => p.status !== "setup" && needs(p)).map((p) => ({ p, text: `${needs(p)} content to review`, icon: "" })),
    ...list.filter((p) => !needs(p) && signals.get(p.id)?.inProgress).map((p) => ({ p, text: "In progress…", icon: "gray" })),
  ].slice(0, 4);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Jakarta" }).format(new Date()));
  const greet = hour < 11 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <main className="page">
      <LiveRefresh sources={[{ table: "projects" }, { table: "video_renders" }, { table: "contents" }]} />
      <div className="eyebrow">STUDIO / OVERVIEW</div>
      <section className="hero">
        <div>
          <div className="eyebrow">✦ YOUR CREATIVE HOME</div>
          <h1>
            {greet},<br />
            <em>{profile?.display_name || "creator"}.</em>
          </h1>
          <p>Start from a thought, a product or a story. Your creative agent turns it into a Project with ready-to-review content, a schedule and automatic YouTube publishing.</p>
          <StartProject />
        </div>
        <div className="heroart">
          <div className="art-card one"><span className="art-circle" /><span>✳︎</span></div>
          <div className="art-card two"><span className="art-circle" /><span>🎬</span></div>
          <div className="art-caption">✦ IDEA → PROJECT</div>
        </div>
      </section>

      <div className="grid g4" style={{ margin: "20px 0" }}>
        {[
          { label: "Projects", value: list.length, icon: Folder },
          { label: "Content to review", value: toReview ?? 0, icon: FileText },
          { label: "Videos ready", value: videosReady ?? 0, icon: Film },
          { label: "Live projects", value: active.length, icon: Zap },
        ].map((m) => (
          <div key={m.label} className="card metric">
            <div className="row between"><span>{m.label}</span><span className="iconTile"><m.icon size={16} /></span></div>
            <strong>{m.value}</strong>
            <small>Across your Studio</small>
          </div>
        ))}
      </div>

      <div className="grid g2">
        <div className="card pad">
          <div className="section">
            <div><div className="eyebrow">PICK UP WHERE YOU LEFT OFF</div><h2>Needs your attention</h2></div>
            <Link href="/content" className="linklike">See content →</Link>
          </div>
          {attention.length ? attention.map(({ p, text, icon }) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="listrow rowclick" style={{ textDecoration: "none" }}>
              <div className="row">
                <span className={`iconTile ${icon}`}><Folder size={16} /></span>
                <div><div className="small semibold">{p.title}</div><div className="xs muted">{text}</div></div>
              </div>
              <span className="icbtn"><ArrowRight size={15} /></span>
            </Link>
          )) : <p className="small muted">Nothing waiting. Start a new idea above.</p>}
        </div>

        <div className="card pad">
          <div className="section">
            <div><div className="eyebrow">YOUR AUTOMATION</div><h2>Automation at a glance</h2></div>
            <Link href="/automation" className="linklike">Manage →</Link>
          </div>
          {active[0] ? (
            <div className="note green" style={{ marginBottom: 12 }}>
              <strong>{active[0].title}</strong><br />Publishing {describeSchedule(active[0].schedule)}
            </div>
          ) : (
            <div className="note" style={{ marginBottom: 12 }}>No live projects yet — approve &amp; schedule one to start publishing.</div>
          )}
          <div className="kv"><label>Live projects</label><strong>{active.length}</strong></div>
          <div className="kv"><label>Next upload</label><strong>{fmtDateTime(nextJob?.scheduled_for)}</strong></div>
        </div>
      </div>

      <div className="dashboard-bottom">
        <div className="section">
          <div><div className="eyebrow">YOUR CREATIVE WORK</div><h2>Recent Projects</h2></div>
          <Link href="/projects" className="linklike">All Projects →</Link>
        </div>
        <div className="grid g3">
          {list.slice(0, 3).map((p) => <ProjectCard key={p.id} p={p} signals={signals.get(p.id)} />)}
        </div>
      </div>
    </main>
  );
}
