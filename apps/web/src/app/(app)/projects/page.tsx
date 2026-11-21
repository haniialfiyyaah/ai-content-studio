import Link from "next/link";
import { ProjectCard } from "@/components/project/project-card";
import { EmptyState, PageHead } from "@/components/ui/empty";
import { LiveRefresh } from "@/components/ui/live-refresh";
import type { ProjectRow } from "@/lib/server/rows";
import { requireUser } from "@/lib/server/session";
import { SAVED_PROJECTS_FILTER, projectSignals, type ProjectSignals } from "@/lib/server/signals";

const FILTERS = [
  ["all", "All"],
  ["needs", "Needs you"],
  ["setting_up", "Setting up"],
  ["planning", "Planning"],
  ["producing", "Producing"],
  ["ready", "Ready to publish"],
  ["live", "Live"],
  ["paused", "Paused / stopped"],
  ["archived", "Archived"],
] as const;
type Filter = (typeof FILTERS)[number][0];

function matches(f: Filter, p: ProjectRow, s?: ProjectSignals) {
  const phase = s?.phase;
  switch (f) {
    case "all": return phase !== "archived";
    case "needs": return phase !== "archived" && (s?.needsYou ?? 0) > 0;
    case "paused": return phase === "paused" || phase === "stopped";
    default: return phase === f;
  }
}

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f: raw } = await searchParams;
  const f: Filter = (FILTERS.find(([k]) => k === raw)?.[0] ?? "all") as Filter;
  const { supabase } = await requireUser();
  const { data } = await supabase.from("projects").select("*").or(SAVED_PROJECTS_FILTER).order("updated_at", { ascending: false });
  const all = (data ?? []) as ProjectRow[];
  const signals = await projectSignals(supabase, all);
  const list = all.filter((p) => matches(f, p, signals.get(p.id)));
  return (
    <main className="page">
      <LiveRefresh sources={[{ table: "projects" }, { table: "contents" }, { table: "video_renders" }, { table: "publish_jobs" }]} />
      <PageHead eyebrow="WORKSPACE" title="Projects" text="Every idea becomes a Project with its own conversation, content, schedule and automation." />
      <div className="filters">
        {FILTERS.map(([k, label]) => {
          const n = all.filter((p) => matches(k, p, signals.get(p.id))).length;
          return (
            <Link key={k} href={k === "all" ? "/projects" : `/projects?f=${k}`} className={`filter ${f === k ? "on" : ""}`} scroll={false}>
              {label}{k !== "all" && n ? ` · ${n}` : ""}
            </Link>
          );
        })}
      </div>
      {list.length ? <div className="grid g3">{list.map((p) => <ProjectCard key={p.id} p={p} signals={signals.get(p.id)} />)}</div> : (
        <EmptyState title={all.length ? "Nothing here" : "No projects yet"} text={all.length ? "No project matches this filter right now." : "Describe an idea on the Overview and the agent will build your first Project."} />
      )}
    </main>
  );
}
