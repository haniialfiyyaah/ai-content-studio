import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/projects/status-pill";

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
          <ul className="flex flex-col gap-3">
            {list.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className="flex flex-col gap-2 rounded-xl border border-border bg-surface-strong px-4 py-4 transition hover:border-accent/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{project.name}</p>
                    {project.objective && (
                      <p className="mt-1 line-clamp-1 text-sm text-muted">
                        {project.objective}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs capitalize text-muted">
                      {project.content_mode}
                    </span>
                    <StatusPill status={project.status} />
                    <time
                      className="hidden text-xs text-muted sm:inline"
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
