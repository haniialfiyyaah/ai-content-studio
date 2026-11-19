import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import {
  ConceptContentSchema,
  PublishingPackSchema,
  VisualPlanSchema,
  type ConceptContent,
  type PublishingPack,
  type VisualPlan,
} from "@acs/schemas";
import { createClient } from "@/lib/supabase/server";
import { StatusPill } from "@/components/projects/status-pill";
import { ContentActions } from "@/components/content/content-actions";
import {
  ContentTabs,
  resolveContentTab,
  type ContentTabId,
} from "@/components/content/content-tabs";

interface ConceptRow {
  id: string;
  title: string | null;
  original_input: string | null;
  source: string | null;
  project_id: string;
  selected_for_initial_launch: boolean;
  working_version_id: string | null;
  latest_approved_version_id: string | null;
  created_at: string;
  updated_at: string;
  projects: { id: string; name: string } | null;
}

interface VersionRow {
  id: string;
  concept_id: string;
  version_number: number;
  review_status: string;
  content: unknown;
  visual_plan: unknown;
  publishing_pack: unknown;
  source_asset_ids: unknown;
  approved_at: string | null;
  approval_revoked_at: string | null;
  created_at: string;
}

interface MediaAssetRow {
  id: string;
  kind: string;
  source_type: string | null;
  mime_type: string | null;
  created_at: string;
}

export default async function ContentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const activeTab = resolveContentTab(tabParam);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: conceptData } = await supabase
    .from("concepts")
    .select(
      "id, title, original_input, source, project_id, selected_for_initial_launch, working_version_id, latest_approved_version_id, created_at, updated_at, projects!inner(id, name)",
    )
    .eq("id", id)
    .eq("owner_id", user!.id)
    .maybeSingle();

  if (!conceptData) {
    notFound();
  }

  const concept = conceptData as unknown as ConceptRow;

  const { data: versionData } = await supabase
    .from("concept_versions")
    .select(
      "id, concept_id, version_number, review_status, content, visual_plan, publishing_pack, source_asset_ids, approved_at, approval_revoked_at, created_at",
    )
    .eq("concept_id", id)
    .order("version_number", { ascending: false });

  const versions = (versionData ?? []) as VersionRow[];
  const workingVersion =
    versions.find((v) => v.id === concept.working_version_id) ?? null;
  const approvedVersion =
    versions.find((v) => v.id === concept.latest_approved_version_id) ?? null;

  const displayVersion = workingVersion ?? approvedVersion;
  const content = parseContent(displayVersion?.content);
  const visualPlan = parseVisualPlan(displayVersion?.visual_plan);
  const publishingPack = parsePublishingPack(displayVersion?.publishing_pack);

  const { data: assetsData } = await supabase
    .from("media_assets")
    .select("id, kind, source_type, mime_type, created_at")
    .eq("concept_id", id)
    .eq("owner_id", user!.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(40);

  const assets = (assetsData ?? []) as MediaAssetRow[];

  const isApprovedLive = Boolean(
    workingVersion &&
      workingVersion.review_status === "approved" &&
      !workingVersion.approval_revoked_at,
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div>
        <Link
          href="/content"
          className="text-sm font-medium text-muted transition hover:text-accent"
        >
          ← Content
        </Link>
      </div>

      <section className="studio-panel p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl tracking-tight md:text-4xl">
                {concept.title?.trim() || "Untitled concept"}
              </h1>
              <StatusPill
                status={workingVersion?.review_status ?? "draft"}
              />
            </div>
            {concept.projects && (
              <p className="mt-3 text-sm text-muted">
                Project ·{" "}
                <Link
                  href={`/projects/${concept.projects.id}`}
                  className="text-accent hover:underline"
                >
                  {concept.projects.name}
                </Link>
              </p>
            )}
            <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted">
              <div>
                <dt className="inline">Source · </dt>
                <dd className="inline capitalize">
                  {concept.source ?? "web"}
                </dd>
              </div>
              <div>
                <dt className="inline">Working · </dt>
                <dd className="inline">
                  {workingVersion
                    ? `v${workingVersion.version_number}`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="inline">Approved · </dt>
                <dd className="inline">
                  {approvedVersion
                    ? `v${approvedVersion.version_number}`
                    : "—"}
                </dd>
              </div>
            </dl>
          </div>
          <ContentActions
            conceptId={concept.id}
            workingVersionId={workingVersion?.id ?? null}
            reviewStatus={workingVersion?.review_status ?? null}
            isApprovedLive={isApprovedLive}
          />
        </div>

        <div className="mt-8">
          <Suspense fallback={<div className="h-10 border-b border-border" />}>
            <ContentTabs conceptId={concept.id} />
          </Suspense>
        </div>

        <div className="mt-6">
          {renderTabPanel(activeTab, {
            concept,
            workingVersion,
            approvedVersion,
            versions,
            content,
            visualPlan,
            publishingPack,
            assets,
          })}
        </div>
      </section>
    </div>
  );
}

function renderTabPanel(
  tab: ContentTabId,
  ctx: {
    concept: ConceptRow;
    workingVersion: VersionRow | null;
    approvedVersion: VersionRow | null;
    versions: VersionRow[];
    content: ConceptContent;
    visualPlan: VisualPlan | null;
    publishingPack: PublishingPack | null;
    assets: MediaAssetRow[];
  },
): ReactNode {
  switch (tab) {
    case "overview":
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <InfoCard title="Hook">
            {ctx.content.hook?.trim() || "No hook yet."}
          </InfoCard>
          <InfoCard title="Original input">
            {ctx.concept.original_input?.trim() || "No original input."}
          </InfoCard>
          <InfoCard title="Working version">
            {ctx.workingVersion
              ? `v${ctx.workingVersion.version_number} · ${ctx.workingVersion.review_status}`
              : "No working version."}
          </InfoCard>
          <InfoCard title="Latest approved">
            {ctx.approvedVersion
              ? `v${ctx.approvedVersion.version_number}${
                  ctx.approvedVersion.approved_at
                    ? ` · ${formatDate(ctx.approvedVersion.approved_at)}`
                    : ""
                }`
              : "Not approved yet."}
          </InfoCard>
          {ctx.content.notes && (
            <InfoCard title="Notes">{ctx.content.notes}</InfoCard>
          )}
        </div>
      );
    case "script":
      return (
        <div className="space-y-4">
          <InfoCard title="Script">
            <pre className="whitespace-pre-wrap font-sans text-sm text-muted">
              {ctx.content.script?.trim() || "No script yet."}
            </pre>
          </InfoCard>
          {ctx.content.scenes.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-display text-xl tracking-tight">Scenes</h2>
              <ul className="flex flex-col gap-3">
                {ctx.content.scenes.map((scene, index) => (
                  <li
                    key={scene.id}
                    className="rounded-xl border border-border bg-surface-strong p-4"
                  >
                    <p className="text-sm font-medium">
                      {scene.title?.trim() || `Scene ${index + 1}`}
                    </p>
                    {scene.narration && (
                      <p className="mt-2 text-sm text-muted">{scene.narration}</p>
                    )}
                    {scene.visualDirection && (
                      <p className="mt-1 text-xs text-muted">
                        Visual · {scene.visualDirection}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    case "storyboard":
      return (
        <div className="space-y-4">
          <InfoCard title="Production plan">
            {ctx.visualPlan ? (
              <ul className="space-y-1 text-sm text-muted">
                <li>
                  Mode · {ctx.visualPlan.productionMode ?? "unspecified"}
                </li>
                <li>Aspect · {ctx.visualPlan.aspectRatio}</li>
                {ctx.visualPlan.captionStyle && (
                  <li>Captions · {ctx.visualPlan.captionStyle}</li>
                )}
              </ul>
            ) : (
              "No visual plan yet."
            )}
          </InfoCard>
          {ctx.visualPlan && ctx.visualPlan.scenes.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {ctx.visualPlan.scenes.map((scene) => (
                <li
                  key={scene.sceneId}
                  className="rounded-xl border border-border bg-surface-strong p-4"
                >
                  <p className="text-sm font-medium">Scene {scene.sceneId}</p>
                  <dl className="mt-2 space-y-1 text-xs text-muted">
                    {scene.shotType && <div>Shot · {scene.shotType}</div>}
                    {scene.motion && <div>Motion · {scene.motion}</div>}
                    {scene.caption && <div>Caption · {scene.caption}</div>}
                    {scene.assets.length > 0 && (
                      <div>Assets · {scene.assets.join(", ")}</div>
                    )}
                  </dl>
                </li>
              ))}
            </ul>
          ) : (
            <PlaceholderPanel
              title="Storyboard"
              body="Visual plan scenes will appear here once drafted."
            />
          )}
        </div>
      );
    case "assets":
      return ctx.assets.length === 0 ? (
        <PlaceholderPanel
          title="Assets"
          body="No media assets linked to this concept yet."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {ctx.assets.map((asset) => (
            <li
              key={asset.id}
              className="rounded-xl border border-border bg-surface-strong px-4 py-3"
            >
              <p className="text-sm font-medium capitalize">{asset.kind}</p>
              <p className="mt-1 text-xs text-muted">
                {asset.source_type ?? "unknown"}
                {asset.mime_type ? ` · ${asset.mime_type}` : ""}
              </p>
              <time className="mt-2 block text-xs text-muted" dateTime={asset.created_at}>
                {formatDate(asset.created_at)}
              </time>
            </li>
          ))}
        </ul>
      );
    case "publishing":
      return (
        <div className="space-y-4">
          <InfoCard title="Publishing pack">
            {ctx.publishingPack ? (
              <ul className="space-y-1 text-sm text-muted">
                <li>Title · {ctx.publishingPack.title?.trim() || "—"}</li>
                <li>
                  Description ·{" "}
                  {ctx.publishingPack.description?.trim() || "—"}
                </li>
                <li>
                  Tags ·{" "}
                  {ctx.publishingPack.tags.length > 0
                    ? ctx.publishingPack.tags.join(", ")
                    : "—"}
                </li>
                <li>Locale · {ctx.publishingPack.locale}</li>
              </ul>
            ) : (
              "No publishing pack yet."
            )}
          </InfoCard>
          <p className="text-sm text-muted">
            Schedule an approved video from the{" "}
            <Link href="/publishing/schedule" className="text-accent hover:underline">
              publishing composer
            </Link>
            .
          </p>
        </div>
      );
    case "history":
      return ctx.versions.length === 0 ? (
        <PlaceholderPanel title="History" body="No versions yet." />
      ) : (
        <ul className="flex flex-col gap-3">
          {ctx.versions.map((version) => (
            <li
              key={version.id}
              className="flex flex-col gap-2 rounded-xl border border-border bg-surface-strong px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-medium">
                  Version {version.version_number}
                  {version.id === ctx.concept.working_version_id
                    ? " · working"
                    : ""}
                  {version.id === ctx.concept.latest_approved_version_id
                    ? " · latest approved"
                    : ""}
                </p>
                <time
                  className="mt-1 block text-xs text-muted"
                  dateTime={version.created_at}
                >
                  {formatDate(version.created_at)}
                  {version.approved_at
                    ? ` · approved ${formatDate(version.approved_at)}`
                    : ""}
                  {version.approval_revoked_at ? " · revoked" : ""}
                </time>
              </div>
              <StatusPill status={version.review_status} />
            </li>
          ))}
        </ul>
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

function parseContent(raw: unknown): ConceptContent {
  const parsed = ConceptContentSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : ConceptContentSchema.parse({});
}

function parseVisualPlan(raw: unknown): VisualPlan | null {
  if (!raw || (typeof raw === "object" && Object.keys(raw as object).length === 0)) {
    return null;
  }
  const parsed = VisualPlanSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function parsePublishingPack(raw: unknown): PublishingPack | null {
  if (!raw || (typeof raw === "object" && Object.keys(raw as object).length === 0)) {
    return null;
  }
  const parsed = PublishingPackSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
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
