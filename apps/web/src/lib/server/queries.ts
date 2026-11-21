import "server-only";
import { ScheduleSchema, readiness } from "@acs/domain";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import { listAssets } from "./assets";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActivityRow, ContentRow, MessageRow, ProjectRow, PublishJobRow, RenderRow, RunRow } from "./rows";

export type RenderView = RenderRow & { url: string | null };

/** Latest render per content, with a signed URL when ready. */
export async function latestRenders(supabase: SupabaseClient, contentIds: string[]) {
  const map = new Map<string, RenderView>();
  if (!contentIds.length) return map;
  const { data } = await supabase
    .from("video_renders")
    .select("*")
    .in("content_id", contentIds)
    .order("created_at", { ascending: false });
  const latest: RenderRow[] = [];
  const seen = new Set<string>();
  for (const r of (data ?? []) as RenderRow[]) {
    if (seen.has(r.content_id)) continue;
    seen.add(r.content_id);
    latest.push(r);
  }
  const urls = await signVideos(latest.filter((r) => r.status === "ready" && r.storage_path).map((r) => r.storage_path!));
  for (const r of latest) map.set(r.content_id, { ...r, url: r.storage_path ? urls.get(r.storage_path) ?? null : null });
  return map;
}

/** One batched signing call instead of one request per video. */
export async function signVideos(paths: string[], seconds = 3600): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!paths.length) return out;
  const { data } = await createAdminClient().storage.from("renders").createSignedUrls(paths, seconds);
  for (const d of data ?? []) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
  return out;
}

/** Latest render per content for a whole project (one query + one batched signing call). */
export async function latestRendersForProject(supabase: SupabaseClient, projectId: string) {
  const { data } = await supabase.from("video_renders").select("*").eq("project_id", projectId).order("created_at", { ascending: false });
  const map = new Map<string, RenderView>();
  const latest: RenderRow[] = [];
  for (const r of (data ?? []) as RenderRow[]) {
    if (map.has(r.content_id) || latest.some((x) => x.content_id === r.content_id)) continue;
    latest.push(r);
  }
  const urls = await signVideos(latest.filter((r) => r.status === "ready" && r.storage_path).map((r) => r.storage_path!));
  for (const r of latest) map.set(r.content_id, { ...r, url: r.storage_path ? urls.get(r.storage_path) ?? null : null });
  return map;
}

/** Everything the project workspace needs, fetched in ONE parallel round. */
export async function loadWorkspace(supabase: SupabaseClient, userId: string, projectId: string) {
  const [projectRes, contentsRes, runRes, convoRes, msgsRes, jobsRes, activityRes, profileRes, ytRes, renders, assets] =
    await Promise.all([
      supabase.from("projects").select("*").eq("id", projectId).maybeSingle(),
      supabase.from("contents").select("*").eq("project_id", projectId).neq("status", "removed").order("position"),
      supabase.from("generation_runs").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("conversations").select("id").eq("project_id", projectId).eq("channel", "web").order("created_at").limit(1).maybeSingle(),
      supabase
        .from("messages")
        .select("*, conversations!inner(project_id, channel)")
        .eq("conversations.project_id", projectId)
        .eq("conversations.channel", "web")
        .order("created_at")
        .limit(100),
      supabase.from("publish_jobs").select("*").eq("project_id", projectId),
      supabase.from("activity_events").select("id, project_id, kind, message, created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(30),
      supabase.from("profiles").select("timezone").eq("id", userId).maybeSingle(),
      supabase.from("connected_accounts").select("id").eq("platform", "youtube").eq("status", "connected").maybeSingle(),
      latestRendersForProject(supabase, projectId),
      listAssets(projectId),
    ]);
  if (!projectRes.data) notFound();
  const p = projectRes.data as ProjectRow;
  const list = (contentsRes.data ?? []) as ContentRow[];

  return {
    project: p,
    contents: list,
    run: (runRes.data as RunRow | null) ?? null,
    conversationId: (convoRes.data?.id as string | undefined) ?? null,
    messages: (msgsRes.data ?? []) as MessageRow[],
    jobs: new Map(((jobsRes.data ?? []) as PublishJobRow[]).map((j) => [j.content_id, j])),
    activity: (activityRes.data ?? []) as ActivityRow[],
    renders,
    assets,
    readiness: readiness({
      status: p.status,
      contentCount: list.length,
      approvedCount: list.filter((c) => c.status === "approved").length,
      hasSchedule: ScheduleSchema.safeParse(p.schedule).success,
      youtubeConnected: Boolean(ytRes.data),
    }),
    timezone: (profileRes.data?.timezone as string | undefined) ?? "Asia/Jakarta",
  };
}

/**
 * Signed URLs for a render's scene images, by scene index (null = design /
 * gradient beat or not generated). Batched per bucket.
 */
export async function sceneImageUrls(steps: unknown[] | null | undefined, seconds = 3600): Promise<(string | null)[]> {
  const list = (steps ?? []) as { scene: number; source?: string; imagePath?: string; referencePath?: string; url?: string | null }[];
  if (!list.length) return [];
  const admin = createAdminClient();
  const renderPaths = list.filter((s) => s.source === "openai" && s.imagePath).map((s) => s.imagePath!);
  const assetPaths = list.filter((s) => s.source === "reference" && s.referencePath).map((s) => s.referencePath!);
  const [r, a] = await Promise.all([
    renderPaths.length ? admin.storage.from("renders").createSignedUrls(renderPaths, seconds) : Promise.resolve({ data: [] }),
    assetPaths.length ? admin.storage.from("assets").createSignedUrls(assetPaths, seconds) : Promise.resolve({ data: [] }),
  ]);
  const signed = new Map<string, string>();
  for (const d of [...(r.data ?? []), ...(a.data ?? [])]) if (d.path && d.signedUrl) signed.set(d.path, d.signedUrl);
  const out: (string | null)[] = [];
  for (const s of list) {
    out[s.scene] =
      s.source === "openai" ? signed.get(s.imagePath ?? "") ?? null
      : s.source === "reference" ? signed.get(s.referencePath ?? "") ?? null
      : s.source === "fal" ? s.url ?? null
      : null;
  }
  return out;
}
