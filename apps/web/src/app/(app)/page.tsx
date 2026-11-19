import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { OverviewPrompt } from "@/components/overview/overview-prompt";

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
    <div className="app-page">
      <section className="studio-hero">
        <p className="auth-brand">Overview</p>
        <h1 className="app-hero-title">
          {isReturning
            ? "Pick up where your creative system left off."
            : "Your idea. On-brand creativity. Automated production."}
        </h1>
        <p className="app-hero-copy">
          {isReturning
            ? "Review Projects that need attention, or open the agent to continue planning."
            : "Describe what you want to make. The shared AI agent will open a Draft Project you can refine, approve, and activate."}
        </p>
        <OverviewPrompt />
        <div className="app-actions">
          <Link href="/agent">
            <Button size="lg" className="studio-button" style={{ width: "auto" }}>
              Create with AI
            </Button>
          </Link>
          <Link href="/projects">
            <Button size="lg" variant="secondary" className="studio-button-secondary" style={{ height: "3rem", padding: "0 1.25rem" }}>
              Browse Projects
            </Button>
          </Link>
        </div>
      </section>

      <section className="app-stat-grid">
        <StatCard label="Draft" value={countStatus(projects, "draft")} />
        <StatCard label="Active" value={countStatus(projects, "active")} />
        <StatCard label="Needs review" value="—" />
      </section>

      <section className="studio-panel" style={{ padding: "1.5rem 2rem" }}>
        <div className="app-section-head">
          <h2 className="app-section-title">Recent Projects</h2>
          <Link href="/projects" className="auth-footer" style={{ margin: 0, color: "var(--accent)", fontWeight: 500 }}>
            View all
          </Link>
        </div>
        {(projects?.length ?? 0) === 0 ? (
          <p className="auth-copy" style={{ marginTop: "1.5rem" }}>
            No Projects yet. Start a conversation with the agent to create your first Draft.
          </p>
        ) : (
          <ul className="app-list">
            {projects!.map((project) => (
              <li key={project.id}>
                <Link href={`/projects/${project.id}`} className="app-list-link">
                  <span style={{ fontWeight: 500 }}>{project.name}</span>
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

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="studio-panel app-stat-card">
      <p className="app-stat-label">{label}</p>
      <p className="app-stat-value">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  return <span className="app-status-pill">{status}</span>;
}
