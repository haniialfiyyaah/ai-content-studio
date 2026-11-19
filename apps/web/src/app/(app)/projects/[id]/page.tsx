import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { StatusPill } from "@/components/projects/status-pill";
import {
  ProjectTabs,
  resolveProjectTab,
  type ProjectTabId,
} from "@/components/projects/project-tabs";
import { ProjectLifecycleActions } from "@/components/projects/project-lifecycle-actions";

interface ProjectDetailRow {
  id: string;
  name: string;
  description: string | null;
  objective: string | null;
  status: string;
  content_mode: string;
  timezone: string;
  default_production_mode: string;
  creative_context_version: number;
  settings_version: number;
  activated_at: string | null;
  paused_at: string | null;
  stopped_at: string | null;
  created_at: string;
  updated_at: string;
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const activeTab = resolveProjectTab(tabParam);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: project } = await supabase
    .from("projects")
    .select(
      "id, name, description, objective, status, content_mode, timezone, default_production_mode, creative_context_version, settings_version, activated_at, paused_at, stopped_at, created_at, updated_at",
    )
    .eq("id", id)
    .eq("owner_id", user!.id)
    .maybeSingle();

  if (!project) {
    notFound();
  }

  const row = project as ProjectDetailRow;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div>
        <Link
          href="/projects"
          className="text-sm font-medium text-muted transition hover:text-accent"
        >
          ← Projects
        </Link>
      </div>

      <section className="studio-panel p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl tracking-tight md:text-4xl">
                {row.name}
              </h1>
              <StatusPill status={row.status} />
            </div>
            {row.objective && (
              <p className="mt-3 max-w-2xl text-sm text-muted">{row.objective}</p>
            )}
            <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted">
              <div>
                <dt className="inline">Mode · </dt>
                <dd className="inline capitalize">{row.content_mode}</dd>
              </div>
              <div>
                <dt className="inline">Production · </dt>
                <dd className="inline capitalize">
                  {row.default_production_mode}
                </dd>
              </div>
              <div>
                <dt className="inline">Timezone · </dt>
                <dd className="inline">{row.timezone}</dd>
              </div>
              <div>
                <dt className="inline">Settings v</dt>
                <dd className="inline">{row.settings_version}</dd>
              </div>
            </dl>
          </div>
          <ProjectLifecycleActions
            projectId={row.id}
            status={row.status}
            settingsVersion={row.settings_version}
          />
        </div>

        <div className="mt-8">
          <Suspense fallback={<div className="h-10 border-b border-border" />}>
            <ProjectTabs projectId={row.id} />
          </Suspense>
        </div>

        <div className="mt-6">{renderTabPanel(activeTab, row)}</div>
      </section>
    </div>
  );
}

function renderTabPanel(tab: ProjectTabId, project: ProjectDetailRow) {
  switch (tab) {
    case "overview":
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <InfoCard title="Description">
            {project.description?.trim() || "No description yet."}
          </InfoCard>
          <InfoCard title="Objective">
            {project.objective?.trim() || "No objective yet."}
          </InfoCard>
          <InfoCard title="Lifecycle">
            <ul className="space-y-1 text-sm text-muted">
              <li>Created · {formatDate(project.created_at)}</li>
              <li>Updated · {formatDate(project.updated_at)}</li>
              <li>
                Activated ·{" "}
                {project.activated_at
                  ? formatDate(project.activated_at)
                  : "—"}
              </li>
              <li>
                Paused ·{" "}
                {project.paused_at ? formatDate(project.paused_at) : "—"}
              </li>
              <li>
                Stopped ·{" "}
                {project.stopped_at ? formatDate(project.stopped_at) : "—"}
              </li>
            </ul>
          </InfoCard>
          <InfoCard title="Creative context">
            Version {project.creative_context_version}. Kit and brand context
            will appear here once configured.
          </InfoCard>
        </div>
      );
    case "content":
      return (
        <PlaceholderPanel
          title="Content"
          body="Concept drafts and review queues will list here."
        />
      );
    case "kit":
      return (
        <PlaceholderPanel
          title="Creative Kit"
          body="Brand voice, visual rules, and kit overrides will live here."
        />
      );
    case "automation":
      return (
        <PlaceholderPanel
          title="Automation"
          body="Ideation and publishing rules appear once the Project is Active."
        />
      );
    case "publishing":
      return (
        <PlaceholderPanel
          title="Publishing"
          body="Schedules and destination authorizations will show here."
        />
      );
    case "assets":
      return (
        <PlaceholderPanel
          title="Assets"
          body="Generated media and uploads for this Project."
        />
      );
    case "activity":
      return (
        <PlaceholderPanel
          title="Activity"
          body="Agent runs, stage events, and audit history will stream here."
        />
      );
    default:
      return null;
  }
}

function InfoCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-strong p-4">
      <h2 className="text-sm font-medium text-foreground">{title}</h2>
      <div className="mt-2 text-sm text-muted">{children}</div>
    </div>
  );
}

function PlaceholderPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface-strong/50 px-5 py-10 text-center">
      <h2 className="font-display text-xl tracking-tight">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{body}</p>
    </div>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
