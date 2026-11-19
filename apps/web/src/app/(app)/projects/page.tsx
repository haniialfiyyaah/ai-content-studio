import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/projects/status-pill";
import { projectInitial, projectTone } from "@/lib/project-tone";

interface ProjectListRow {
  id: string;
  name: string;
  status: string;
  objective: string | null;
  content_mode: string;
  updated_at: string;
}

export default async function ProjectsLibraryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, status, objective, content_mode, updated_at")
    .eq("owner_id", user!.id)
    .order("updated_at", { ascending: false });

  const list = (projects ?? []) as ProjectListRow[];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-accent">
            Library
          </p>
          <h1 className="font-display mt-2 text-4xl tracking-tight md:text-5xl">
            Projects
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Browse Draft, Active, Paused, and Stopped Projects. Activate never
            implies paid media or publish authorization.
          </p>
        </div>
        <Link href="/agent">
          <Button size="lg">Create with AI</Button>
        </Link>
      </section>

      <section className="studio-panel p-6 md:p-8">
        {list.length === 0 ? (
          <div className="py-10 text-center">
            <h2 className="font-display text-2xl tracking-tight">
              No Projects yet
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">
              Start a conversation with the Creative Agent to open your first
              Draft Project.
            </p>
            <Link href="/agent" className="mt-6 inline-block">
              <Button>Open Creative Agent</Button>
            </Link>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((project) => (
              <li key={project.id}>
                <Link href={`/projects/${project.id}`} className="project-card">
                  <span
                    className="project-tile project-tile--cover"
                    data-tone={projectTone(project.id)}
                    aria-hidden
                  >
                    {projectInitial(project.name)}
                  </span>
                  <div className="px-1">
                    <h2 className="text-sm font-extrabold tracking-tight">
                      {project.name}
                    </h2>
                    <p className="mt-1 line-clamp-2 min-h-10 text-xs leading-5 text-muted">
                      {project.objective?.trim() || "No objective saved yet."}
                    </p>
                  </div>
                  <div className="mt-auto flex items-center justify-between border-t border-border px-1 pt-3">
                    <StatusPill status={project.status} />
                    <time
                      className="text-[10px] text-muted"
                      dateTime={project.updated_at}
                    >
                      {formatRelative(project.updated_at)}
                    </time>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
