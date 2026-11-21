import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectRow } from "./rows";

/**
 * What a creator needs to know about a project at a glance, next to its status:
 * does it need me, is something running, when is the next upload, auto or manual.
 */
export interface ProjectSignals {
  /** Things waiting for the creator's confirm (ideas to review, setup step to answer). */
  needsYou: number;
  /** Something is generating or rendering right now. */
  inProgress: boolean;
  /** Next scheduled upload (ISO) or null. */
  nextUpload: string | null;
  auto: boolean;
}

/** Projects the creator has actually saved: setup drafts count once the agent made the concept. */
export const SAVED_PROJECTS_FILTER = "status.neq.setup,concept->>title.not.is.null";

export async function projectSignals(supabase: SupabaseClient, projects: ProjectRow[]): Promise<Map<string, ProjectSignals>> {
  const ids = projects.map((p) => p.id);
  const out = new Map<string, ProjectSignals>();
  if (!ids.length) return out;
  const [drafts, runs, renders, boards, jobs] = await Promise.all([
    supabase.from("contents").select("project_id").in("project_id", ids).eq("status", "idea"),
    supabase.from("generation_runs").select("project_id").in("project_id", ids).in("status", ["queued", "running"]),
    supabase.from("video_renders").select("project_id").in("project_id", ids).in("status", ["queued", "rendering"]),
    supabase.from("contents").select("project_id").in("project_id", ids).eq("storyboard_status", "generating"),
    supabase.from("publish_jobs").select("project_id, scheduled_for").in("project_id", ids).eq("status", "scheduled").order("scheduled_for"),
  ]);
  const count = (rows: { project_id: string }[] | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.project_id, (m.get(r.project_id) ?? 0) + 1);
    return m;
  };
  const draftN = count(drafts.data);
  const busy = new Set([...(runs.data ?? []), ...(renders.data ?? []), ...(boards.data ?? [])].map((r) => r.project_id));
  const next = new Map<string, string>();
  for (const j of jobs.data ?? []) if (!next.has(j.project_id)) next.set(j.project_id, j.scheduled_for);

  for (const p of projects) {
    // Agent-guided steps (project setup, content plan, storyboards) wait for one check, not per content.
    const guided = p.status === "setup" || p.content_stage === "plan" || p.content_stage === "storyboard";
    const setupBusy = guided && Boolean(p.setup_busy);
    out.set(p.id, {
      needsYou: guided ? (setupBusy ? 0 : 1) : p.status === "stopped" ? 0 : (draftN.get(p.id) ?? 0),
      inProgress: setupBusy || busy.has(p.id),
      nextUpload: p.status === "live" ? (next.get(p.id) ?? null) : null,
      auto: Boolean(p.auto_approve),
    });
  }
  return out;
}
