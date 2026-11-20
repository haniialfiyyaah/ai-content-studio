import { ProjectCard } from "@/components/project/project-card";
import { EmptyState, PageHead } from "@/components/ui/empty";
import { LiveRefresh } from "@/components/ui/live-refresh";
import type { ProjectRow } from "@/lib/server/rows";
import { requireUser } from "@/lib/server/session";

export default async function ProjectsPage() {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("projects").select("*").order("updated_at", { ascending: false });
  const list = (data ?? []) as ProjectRow[];
  return (
    <main className="page">
      <LiveRefresh sources={[{ table: "projects" }]} />
      <PageHead eyebrow="WORKSPACE" title="Projects" text="Every idea becomes a Project with its own conversation, content, schedule and automation." />
      {list.length ? <div className="grid g3">{list.map((p) => <ProjectCard key={p.id} p={p} />)}</div> : (
        <EmptyState title="No projects yet" text="Describe an idea on the Overview and the agent will build your first Project." />
      )}
    </main>
  );
}
