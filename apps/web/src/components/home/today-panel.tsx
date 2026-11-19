import Link from "next/link";
import type { AgentRun } from "@/lib/overview/decision-queue";
import { projectInitial, projectTone } from "@/lib/project-tone";

export interface TodayCounts {
  waitingOnYou: number;
  withAgent: number;
  scheduled: number;
}

export interface SummaryProject {
  id: string;
  name: string;
  status: string;
}

const RUN_STATUS_TEXT: Record<string, string> = {
  queued: "queued",
  running: "running",
  partial: "partly done",
  completed: "done",
  needs_input: "needs your input",
  failed: "failed",
  cancelled: "cancelled",
};

export function TodayPanel({
  counts,
  latestRun,
  projects,
  orchestratedByN8n,
}: {
  counts: TodayCounts;
  latestRun: AgentRun | null;
  projects: SummaryProject[];
  orchestratedByN8n: boolean;
}) {
  return (
    <aside className="home-aside" aria-label="Today and projects">
      <section aria-labelledby="today-heading">
        <h2 id="today-heading" className="app-section-title">
          Today
        </h2>
        <ul className="today-list">
          <li className="today-row">
            <span className="today-dot" data-tone="current" aria-hidden />
            Waiting on you
            <strong>{counts.waitingOnYou}</strong>
          </li>
          <li className="today-row">
            <span className="today-dot" data-tone="working" aria-hidden />
            With the agent
            <strong>{counts.withAgent}</strong>
          </li>
          <li className="today-row">
            <span className="today-dot" data-tone="done" aria-hidden />
            Scheduled
            <strong>{counts.scheduled}</strong>
          </li>
        </ul>
        <p className="today-note">
          {latestRun
            ? `Last agent run: ${humanize(latestRun.workflowType)}, ${
                RUN_STATUS_TEXT[latestRun.status] ?? latestRun.status
              }.`
            : "No agent runs yet."}{" "}
          {orchestratedByN8n
            ? "Planning runs on n8n."
            : "Planning runs in this app until n8n is connected."}
        </p>
      </section>

      <section aria-labelledby="projects-heading">
        <div className="app-section-head">
          <h2 id="projects-heading" className="app-section-title">
            Projects
          </h2>
          <Link href="/projects" className="app-section-link">
            View all
          </Link>
        </div>
        {projects.length === 0 ? (
          <p className="aside-empty">Projects the agent drafts appear here.</p>
        ) : (
          <ul className="project-list">
            {projects.map((project) => (
              <li key={project.id}>
                <Link href={`/projects/${project.id}`} className="project-link">
                  <span
                    className="project-tile"
                    data-tone={projectTone(project.id)}
                    aria-hidden
                  >
                    {projectInitial(project.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="project-name block">{project.name}</span>
                    <span className="project-status block">{project.status}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}

function humanize(value: string): string {
  const text = value.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
