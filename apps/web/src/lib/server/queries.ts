import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import { listAssets } from "./assets";
import { projectReadiness } from "./projects";
import { signedVideoUrl } from "./renders";
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
  for (const r of (data ?? []) as RenderRow[]) {
    if (map.has(r.content_id)) continue;
    map.set(r.content_id, { ...r, url: r.status === "ready" ? await signedVideoUrl(r.storage_path) : null });
  }
  return map;
}

export async function loadWorkspace(supabase: SupabaseClient, userId: string, projectId: string) {
  const { data: project } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
  if (!project) notFound();
  const p = project as ProjectRow;

  const [{ data: contents }, { data: run }, { data: convo }, { data: jobs }, { data: activity }, { data: research }, { data: profile }] =
    await Promise.all([
      supabase.from("contents").select("*").eq("project_id", p.id).neq("status", "archived").order("position"),
      supabase.from("generation_runs").select("*").eq("project_id", p.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("conversations").select("id").eq("project_id", p.id).eq("channel", "web").order("created_at").limit(1).maybeSingle(),
      supabase.from("publish_jobs").select("*").eq("project_id", p.id),
      supabase.from("activity_events").select("id, project_id, kind, message, created_at").eq("project_id", p.id).order("created_at", { ascending: false }).limit(30),
      supabase.from("research_notes").select("payload").eq("project_id", p.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("profiles").select("timezone").eq("id", userId).maybeSingle(),
    ]);
  const { data: messages } = convo
    ? await supabase.from("messages").select("*").eq("conversation_id", convo.id).order("created_at").limit(100)
    : { data: [] };

  const list = (contents ?? []) as ContentRow[];
  return {
    project: p,
    contents: list,
    run: (run as RunRow | null) ?? null,
    conversationId: (convo?.id as string | undefined) ?? null,
    messages: (messages ?? []) as MessageRow[],
    jobs: new Map(((jobs ?? []) as PublishJobRow[]).map((j) => [j.content_id, j])),
    activity: (activity ?? []) as ActivityRow[],
    research: ((research?.payload as { angles?: { title: string; why: string }[] } | undefined)?.angles ?? []),
    renders: await latestRenders(supabase, list.map((c) => c.id)),
    readiness: await projectReadiness(userId, p),
    assets: await listAssets(p.id),
    timezone: (profile?.timezone as string | undefined) ?? "Asia/Jakarta",
  };
}
