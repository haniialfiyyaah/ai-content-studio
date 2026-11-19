import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

export default async function OverviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, status, updated_at")
    .eq("owner_id", user!.id)
    .order("updated_at", { ascending: false })
    .limit(5);

  const isReturning = (projects?.length ?? 0) > 0;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <section className="studio-panel overflow-hidden p-8 md:p-10">
        <p className="text-sm font-medium uppercase tracking-[0.16em] text-accent">
          Overview
        </p>
        <h1 className="font-display mt-3 max-w-2xl text-4xl leading-tight tracking-tight md:text-5xl">
          {isReturning
            ? "Pick up where your creative system left off."
            : "Your idea. On-brand creativity. Automated production."}
        </h1>
        <p className="mt-4 max-w-xl text-base text-muted">
          {isReturning
            ? "Review Projects that need attention, or open the agent to continue planning."
            : "Describe what you want to make. The shared AI agent will open a Draft Project you can refine, approve, and activate."}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/agent">
            <Button size="lg">Create with AI</Button>
          </Link>
          <Link href="/projects">
            <Button size="lg" variant="secondary">
              Browse Projects
            </Button>
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Draft" value={countStatus(projects, "draft")} />
        <StatCard label="Active" value={countStatus(projects, "active")} />
        <StatCard label="Needs review" value={0} />
      </section>

      <section className="studio-panel p-6 md:p-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl tracking-tight">Recent Projects</h2>
          <Link href="/projects" className="text-sm font-medium text-accent">
            View all
          </Link>
        </div>
        {(projects?.length ?? 0) === 0 ? (
          <p className="mt-6 text-sm text-muted">
            No Projects yet. Start a conversation with the agent to create your first Draft.
          </p>
        ) : (
          <ul className="mt-6 flex flex-col gap-3">
            {projects!.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className="flex items-center justify-between rounded-xl border border-border bg-surface-strong px-4 py-3 transition hover:border-accent/40"
                >
                  <span className="font-medium">{project.name}</span>
                  <StatusPill status={project.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function countStatus(
  projects: { status: string }[] | null | undefined,
  status: string,
): number {
  return projects?.filter((p) => p.status === status).length ?? 0;
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="studio-panel p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="font-display mt-2 text-3xl tracking-tight">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium capitalize text-accent">
      {status}
    </span>
  );
}
