import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { getLatestKit } from "@acs/domain";
import { createClient } from "@/lib/supabase/server";
import { StatusPill } from "@/components/projects/status-pill";
import { ProjectTabs } from "@/components/projects/project-tabs";
import {
  resolveProjectTab,
  type ProjectTabId,
} from "@/lib/project-tabs";
import { ProjectLifecycleActions } from "@/components/projects/project-lifecycle-actions";
import { InitialLaunchList } from "@/components/projects/initial-launch-list";
import { CreativeKitPanel } from "@/components/projects/creative-kit-panel";

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

        <div className="mt-6">
          {await renderTabPanel(activeTab, row, user!.id)}
        </div>
      </section>
    </div>
  );
}

async function renderTabPanel(
  tab: ProjectTabId,
  project: ProjectDetailRow,
  ownerId: string,
) {
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
            Version {project.creative_context_version}. Open the Creative Kit tab
            to review or update brand voice.
          </InfoCard>
        </div>
      );
    case "content": {
      const supabase = await createClient();
      const { data } = await supabase
        .from("concepts")
        .select(
          "id, title, updated_at, source, selected_for_initial_launch, working:concept_versions!concepts_working_version_id_fkey(review_status)",
        )
        .eq("project_id", project.id)
        .eq("owner_id", ownerId)
        .order("updated_at", { ascending: false });

      const concepts = (data ?? []) as Array<{
        id: string;
        title: string | null;
        updated_at: string;
        source: string | null;
        selected_for_initial_launch: boolean;
        working: { review_status: string } | { review_status: string }[] | null;
      }>;

      if (concepts.length === 0) {
        return (
          <PlaceholderPanel
            title="No concepts yet"
            body="Ask the Creative Agent for a project idea. Planning creates one draft concept here. Script and storyboard stay empty until that draft is filled."
          />
        );
      }

      const items = concepts.map((concept) => {
        const working = Array.isArray(concept.working)
          ? concept.working[0]
          : concept.working;
        return {
          id: concept.id,
          title: concept.title,
          updatedAt: formatDate(concept.updated_at),
          source: concept.source,
          reviewStatus: working?.review_status ?? "draft",
          selected: concept.selected_for_initial_launch,
        };
      });

      if (project.status === "draft") {
        return (
          <InitialLaunchList
            projectId={project.id}
            settingsVersion={project.settings_version}
            concepts={items}
          />
        );
      }

      return (
        <ul className="flex flex-col gap-3">
          {items.map((concept) => (
            <li key={concept.id}>
              <Link
                href={`/content/${concept.id}`}
                className="flex flex-col gap-1 rounded-xl border border-border bg-surface-strong px-4 py-4 transition hover:border-accent sm:flex-row sm:items-center sm:justify-between"
              >
                <span>
                  <span className="block font-medium">
                    {concept.title?.trim() || "Untitled concept"}
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    {concept.source ?? "web"} · {concept.updatedAt}
                    {concept.selected ? " · Initial launch" : ""}
                  </span>
                </span>
                <StatusPill status={concept.reviewStatus} />
              </Link>
            </li>
          ))}
        </ul>
      );
    }
    case "kit": {
      const supabase = await createClient();
      const kit = await getLatestKit(supabase, {
        projectId: project.id,
        ownerId,
      });
      return (
        <CreativeKitPanel
          projectId={project.id}
          initialKit={
            kit
              ? {
                  id: kit.id,
                  version: kit.version,
                  languageDefault: kit.languageDefault,
                  tone: kit.tone,
                  audience: kit.audience,
                  brandOrCreatorName: kit.brandOrCreatorName,
                  doSay: kit.doSay,
                  dontSay: kit.dontSay,
                  visualNotes: kit.visualNotes,
                  updatedAt: kit.updatedAt,
                }
              : null
          }
        />
      );
    }
    case "automation": {
      const supabase = await createClient();
      const { data } = await supabase
        .from("automation_rules")
        .select("id, kind, status, enabled, next_due_at")
        .eq("project_id", project.id)
        .eq("owner_id", ownerId)
        .order("updated_at", { ascending: false });
      const rules = data ?? [];
      if (rules.length === 0) {
        return (
          <PlaceholderPanel
            title="No automation rules"
            body={
              project.status === "active"
                ? "This Active Project has no rules yet. Configure them from Automation Center."
                : "Rules are available after the Project is Active. Nothing is scheduled yet."
            }
          />
        );
      }
      return (
        <ul className="flex flex-col gap-3">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="rounded-xl border border-border bg-surface-strong px-4 py-3 text-sm"
            >
              <p className="font-medium capitalize">{rule.kind}</p>
              <p className="mt-1 text-xs text-muted">
                {rule.enabled ? "Enabled" : "Disabled"} · {rule.status}
                {rule.next_due_at ? ` · next ${formatDate(rule.next_due_at)}` : ""}
              </p>
            </li>
          ))}
        </ul>
      );
    }
    case "publishing": {
      const supabase = await createClient();
      const { data } = await supabase
        .from("publishing_jobs")
        .select("id, status, scheduled_for")
        .eq("project_id", project.id)
        .eq("owner_id", ownerId)
        .order("scheduled_for", { ascending: false })
        .limit(20);
      const jobs = (data ?? []) as Array<{
        id: string;
        status: string;
        scheduled_for: string | null;
      }>;
      if (jobs.length === 0) {
        return (
          <PlaceholderPanel
            title="Nothing scheduled"
            body="Approved videos are scheduled from the Publishing composer. This Project has no publishing jobs."
          />
        );
      }
      return (
        <ul className="flex flex-col gap-3">
          {jobs.map((job) => (
            <li
              key={job.id}
              className="rounded-xl border border-border bg-surface-strong px-4 py-3 text-sm"
            >
              <StatusPill status={job.status} />
              <p className="mt-2 text-xs text-muted">
                {job.scheduled_for ? formatDate(job.scheduled_for) : "Unscheduled"}
              </p>
            </li>
          ))}
        </ul>
      );
    }
    case "assets": {
      const supabase = await createClient();
      const { data } = await supabase
        .from("media_assets")
        .select("id, kind, source_type, mime_type, provider, created_at")
        .eq("project_id", project.id)
        .eq("owner_id", ownerId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(30);
      const assets = data ?? [];
      if (assets.length === 0) {
        return (
          <PlaceholderPanel
            title="No assets yet"
            body="Uploads and generated videos for this Project appear here after a real render or upload."
          />
        );
      }
      return (
        <ul className="grid gap-3 sm:grid-cols-2">
          {assets.map((asset) => (
            <li
              key={asset.id}
              className="rounded-xl border border-border bg-surface-strong px-4 py-3"
            >
              <p className="text-sm font-medium capitalize">{asset.kind}</p>
              <p className="mt-1 text-xs text-muted">
                {asset.source_type ?? "unknown"}
                {asset.provider ? ` · ${asset.provider}` : ""}
                {asset.mime_type ? ` · ${asset.mime_type}` : ""}
              </p>
            </li>
          ))}
        </ul>
      );
    }
    case "activity": {
      const supabase = await createClient();
      const { data } = await supabase
        .from("workflow_runs")
        .select("id, workflow_type, stage, status, created_at")
        .eq("project_id", project.id)
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false })
        .limit(20);
      const runs = data ?? [];
      if (runs.length === 0) {
        return (
          <PlaceholderPanel
            title="No activity yet"
            body="Agent runs for this Project will show here. Nothing has been recorded."
          />
        );
      }
      return (
        <ul className="flex flex-col gap-3">
          {runs.map((run) => (
            <li
              key={run.id}
              className="rounded-xl border border-border bg-surface-strong px-4 py-3 text-sm"
            >
              <p className="font-medium">{run.workflow_type}</p>
              <p className="mt-1 text-xs text-muted">
                {run.stage ?? run.status} · {formatDate(run.created_at)}
              </p>
            </li>
          ))}
        </ul>
      );
    }
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
