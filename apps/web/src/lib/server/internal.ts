import "server-only";
import {
  AppError,
  ErrorCodes,
  GenerationCompleteSchema,
  type GenerationComplete,
  conflict,
  notFound,
  resolveContent, endingBrief, projectKit } from "@acs/domain";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity, notifyTelegram, postAssistantMessage } from "./events";
import { generateMore, reviseContents } from "./projects";
import { failRender } from "./renders";
import { CONTENT_DUPLICATE, findSimilarContents } from "./similar";
import { queueStoryboards } from "./storyboard";
import type { ContentRow, ProjectRow, RunRow } from "./rows";

const admin = () => createAdminClient();

const STAGE_LABELS: Record<string, string> = {
  understanding: "Understanding your idea",
  creative_kit: "Creating the Creative Kit",
  character: "Designing your character",
  contents: "Developing content and scenes",
  saving: "Preparing your workspace",
};

// ---------------------------------------------------------------------------
// Generation (WF-01)
// ---------------------------------------------------------------------------
export async function generationContext(runId: string) {
  const db = admin();
  const { data: run } = await db.from("generation_runs").select("*").eq("id", runId).maybeSingle();
  if (!run) throw notFound("Run");
  const r = run as RunRow;
  if (r.status === "succeeded" || r.status === "failed") {
    return { runId, skip: true as const, reason: `run already ${r.status}` };
  }
  await db
    .from("generation_runs")
    .update({ status: "running", stage: "understanding", progress: 10, started_at: new Date().toISOString() })
    .eq("id", runId);

  const { data: project } = await db.from("projects").select("*").eq("id", r.project_id).single();
  const p = project as ProjectRow;
  const { data: existing } = await db.from("contents").select("options, selection").eq("project_id", p.id);
  const existingTitles = (existing ?? []).map((c) => resolveContent(c.options, c.selection).title).filter(Boolean);
  const { data: refs } = await db.from("project_assets").select("label").eq("project_id", p.id).order("created_at");
  const references = (refs ?? []).map((r, index) => ({ index, label: r.label || `Reference ${index + 1}` }));

  let revision: { feedback: string; items: { number: number; current: Record<string, string>; scenes: unknown }[] } | null = null;
  if (r.kind === "revision") {
    const { data: all } = await db.from("contents").select("id, options, selection, scenes").eq("project_id", p.id).neq("status", "removed").order("position");
    const ids = (run as RunRow & { target_ids: string[] }).target_ids ?? [];
    revision = {
      feedback: (run as RunRow & { feedback: string | null }).feedback ?? "",
      items: ids
        .map((id) => {
          const idx = (all ?? []).findIndex((c) => c.id === id);
          const c = (all ?? [])[idx];
          return c ? { number: idx + 1, current: resolveContent(c.options, c.selection), scenes: c.scenes } : null;
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x)),
    };
  }

  // storyboard: one locked content concept → its script + scenes (series context for the ending teaser).
  let storyboard: { item: Record<string, string>; feedback: string; series: Record<string, unknown> | null } | null = null;
  if (r.kind === "storyboard") {
    const { data: all } = await db.from("contents").select("id, label, options, selection").eq("project_id", p.id).neq("status", "removed").order("position");
    const list = all ?? [];
    const id = ((run as RunRow & { target_ids: string[] }).target_ids ?? [])[0];
    const idx = list.findIndex((c) => c.id === id);
    const c = list[idx];
    if (c) {
      const cur = resolveContent(c.options, c.selection);
      const plan = (p.content_plan ?? {}) as { format?: string; style?: string; seriesTitle?: string };
      storyboard = {
        item: { label: c.label ?? "", title: cur.title, hook: cur.hook, description: cur.caption, hashtags: cur.hashtags },
        feedback: (run as RunRow & { feedback: string | null }).feedback ?? "",
        series:
          plan.format === "series"
            ? {
                style: plan.style,
                seriesTitle: plan.seriesTitle,
                position: `${c.label || `#${idx + 1}`} of ${list.length}`,
                previous: idx > 0 ? resolveContent(list[idx - 1].options, list[idx - 1].selection).title : null,
                next: idx < list.length - 1 ? resolveContent(list[idx + 1].options, list[idx + 1].selection).title : null,
              }
            : null,
      };
    }
  }

  return {
    runId,
    skip: false as const,
    kind: r.kind,
    revision,
    storyboard,
    contentCount: r.content_count,
    projectId: p.id,
    // WF-01 contract keys: prompt = the creator's idea, creativeKit = kit + concept merged.
    prompt: p.idea,
    title: p.title,
    creativeKit: projectKit(p),
    /** ideation: what the creator asked these new ideas to be about (may be empty). */
    brief: r.kind === "ideation" ? ((run as RunRow & { feedback: string | null }).feedback ?? "") : "",
    endingBrief: endingBrief((p as ProjectRow & { ending?: unknown }).ending, p.title),
    existingTitles,
    visualMode: p.visual_mode,
    references,
  };
}

export async function generationProgress(input: { runId: string; stage: string; progress: number }) {
  await admin()
    .from("generation_runs")
    .update({
      stage: input.stage,
      progress: Math.min(Math.max(Math.round(input.progress), 0), 99),
      status: "running",
    })
    .eq("id", input.runId)
    .in("status", ["queued", "running"]);
  return { ok: true, label: STAGE_LABELS[input.stage] ?? input.stage };
}

export async function generationComplete(raw: unknown) {
  const payload = GenerationCompleteSchema.parse(raw);
  const db = admin();
  const { data: run } = await db.from("generation_runs").select("*").eq("id", payload.runId).maybeSingle();
  if (!run) throw notFound("Run");
  const r = run as RunRow;
  if (r.status === "succeeded") return { runId: r.id, duplicate: true };

  const { data: project } = await db.from("projects").select("*").eq("id", r.project_id).single();
  const p = project as ProjectRow;

  const n = payload.contents.length;
  const title = payload.project?.title ?? p.title;
  const channelLink = (path: string) => path;

  if (r.kind === "storyboard") return storyboardComplete(p, r, payload.contents[0]);

  if (r.kind === "revision") {
    const ids = ((run as RunRow & { target_ids: string[] }).target_ids ?? []).slice(0, n);
    await Promise.all(
      ids.map((id, i) =>
        db
          .from("contents")
          .update({
            options: payload.contents[i].options,
            scenes: payload.contents[i].scenes,
            format: payload.contents[i].format,
            video_prompt: payload.contents[i].videoPrompt,
            selection: {},
            status: "idea",
            approved_at: null,
            storyboard: null,
            storyboard_status: "none",
            storyboard_key: null,
          })
          .eq("id", id)
          .eq("project_id", p.id),
      ),
    );
    await db
      .from("generation_runs")
      .update({ status: "succeeded", stage: "done", progress: 100, finished_at: new Date().toISOString() })
      .eq("id", r.id);
    await logActivity(db, { ownerId: p.owner_id, projectId: p.id, kind: "revision.done", message: `Revised ${ids.length} content from feedback` });
    await postAssistantMessage(db, p.owner_id, p.id, `I revised ${ids.length} content based on your feedback — review the new options and approve when ready.`);
    await notifyTelegram(db, {
      ownerId: p.owner_id,
      projectId: p.id,
      template: "revision.ready",
      chat: false,
      text: `✏️ Updated ${ids.length} content in "${title}". Here are the new versions:`,
      path: channelLink(`/projects/${p.id}`),
      cards: { contentIds: ids },
    });
    return { runId: r.id, revised: ids.length };
  }

  const { data: last } = await db
    .from("contents")
    .select("position")
    .eq("project_id", p.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const start = (last?.position ?? -1) + 1;

  const { data: inserted, error } = await db.from("contents").insert(
    payload.contents.map((c, i) => ({
      owner_id: p.owner_id,
      project_id: p.id,
      run_id: r.id,
      position: start + i,
      options: c.options,
      selection: {},
      scenes: c.scenes,
      format: c.format,
      video_prompt: c.videoPrompt,
    })),
  ).select("id");
  if (error) throw new AppError(ErrorCodes.INTERNAL_ERROR, "Could not save generated content", 500);

  await db
    .from("generation_runs")
    .update({ status: "succeeded", stage: "done", progress: 100, finished_at: new Date().toISOString() })
    .eq("id", r.id);

  const newIds = (inserted ?? []).map((x) => x.id as string);
  await duplicateHeadsUp(p, newIds, payload.contents.map((c) => `${c.options.title[0]}. ${c.options.hook[0]}`));
  {
    await logActivity(db, { ownerId: p.owner_id, projectId: p.id, kind: "ideation.done", message: `${n} new content ideas to review` });
    // First content right after guided setup.
    if (start === 0) {
      await postAssistantMessage(db, p.owner_id, p.id, `Your first ${n} content ideas are ready, written from the setup we agreed on. Review them, untick any you don't want, then Approve & schedule.`);
    }
    await notifyTelegram(db, {
      ownerId: p.owner_id,
      projectId: p.id,
      template: "ideation.ready",
      text: `💡 ${n} new ideas for "${title}" are waiting for your approval.`,
      path: `/projects/${p.id}`,
      cards: { contentIds: newIds },
    });
  }
  return { runId: r.id, contents: n };
}

/**
 * One storyboard is written: keep the locked concept (title, hook, description,
 * hashtags), take the script + scenes. When the last one lands, tell the creator.
 */
async function storyboardComplete(p: ProjectRow, r: RunRow, out: GenerationComplete["contents"][number]) {
  const db = admin();
  const id = ((r as RunRow & { target_ids: string[] }).target_ids ?? [])[0];
  const { data: c } = await db.from("contents").select("options").eq("id", id).maybeSingle();
  if (c && out) {
    await db
      .from("contents")
      .update({
        options: { ...(c.options as object), script: [out.options.script[0] ?? ""] },
        scenes: out.scenes,
        format: out.format,
        video_prompt: out.videoPrompt,
        script_status: "ready",
        storyboard: null,
        storyboard_status: "none",
        storyboard_key: null,
      })
      .eq("id", id);
    // The storyboard shows real images: draw every scene now (each lands live).
    queueStoryboards([id]);
  }
  await db.from("generation_runs").update({ status: "succeeded", stage: "done", progress: 100, finished_at: new Date().toISOString() }).eq("id", r.id);
  const { count } = await db.from("contents").select("id", { count: "exact", head: true }).eq("project_id", p.id).eq("script_status", "writing");
  if (!count) {
    const { count: total } = await db.from("contents").select("id", { count: "exact", head: true }).eq("project_id", p.id).neq("status", "removed");
    await logActivity(db, { ownerId: p.owner_id, projectId: p.id, kind: "storyboards.ready", message: "Storyboards ready" });
    await postAssistantMessage(
      db,
      p.owner_id,
      p.id,
      total && total > 1
        ? "All storyboards are ready ✏️ Check the scenes and script of each video and tell me anything to change."
        : "The storyboard is ready ✏️ Check the scenes and the script and tell me anything to change.",
    );
  }
  return { runId: r.id, storyboard: id };
}

/** After new ideas land: warn in chat when one is still very close to existing content. */
async function duplicateHeadsUp(p: ProjectRow, newIds: string[], texts: string[]) {
  const notes: string[] = [];
  for (let i = 0; i < newIds.length; i++) {
    const [top] = await findSimilarContents(p.id, texts[i] ?? "", { excludeIds: newIds, limit: 1 });
    if (top && top.score >= 0.75) notes.push(`“${texts[i].split(". ")[0]}” is close to #${top.number} “${top.title}”`);
  }
  if (notes.length) {
    await postAssistantMessage(admin(), p.owner_id, p.id, `Heads-up: ${notes.join("; ")}. Ask me for a different angle if you want them further apart.`);
  }
}

export async function generationFail(input: { runId: string; error: string }) {
  const db = admin();
  const { data: run } = await db.from("generation_runs").select("*").eq("id", input.runId).maybeSingle();
  if (!run) throw notFound("Run");
  const r = run as RunRow;
  await db
    .from("generation_runs")
    .update({ status: "failed", error: input.error.slice(0, 500), finished_at: new Date().toISOString() })
    .eq("id", r.id);
  if (r.kind === "storyboard") {
    const id = ((r as RunRow & { target_ids: string[] }).target_ids ?? [])[0];
    if (id) await db.from("contents").update({ script_status: "failed" }).eq("id", id);
  } else {
    await postAssistantMessage(db, r.owner_id, r.project_id, "⚠️ I couldn't finish drafting this time. Tap Try again on the project, or ask me again.");
  }
  await logActivity(db, {
    ownerId: r.owner_id,
    projectId: r.project_id,
    kind: "generation.failed",
    message: "Generation failed — you can retry",
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Scheduler claims (the safety nets behind every fast-path webhook)
// ---------------------------------------------------------------------------
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

export const ClaimDueSchema = z.object({
  kind: z.enum(["generation", "renders", "publish", "analytics", "notifications"]),
  limit: z.number().int().min(1).max(50).default(10),
});

export async function claimDue(raw: unknown) {
  const { kind, limit } = ClaimDueSchema.parse(raw);
  const db = admin();
  const now = new Date().toISOString();

  if (kind === "generation") {
    // queued runs the webhook never started (Autopilot adds due projects here in phase 3) (> 1 min, < 1 day)
    const { data: runs } = await db
      .from("generation_runs")
      .select("id")
      .eq("status", "queued")
      .lte("updated_at", ago(60_000))
      .gte("updated_at", ago(86_400_000))
      .order("updated_at")
      .limit(limit);
    // 3) runs stuck "running" > 15 min are failed so the UI never spins forever
    const { data: stuck } = await db
      .from("generation_runs")
      .select("id")
      .eq("status", "running")
      .lte("updated_at", ago(15 * 60_000));
    for (const s of stuck ?? []) await generationFail({ runId: s.id, error: "Timed out" });
    return { kind, jobs: (runs ?? []).map((r) => ({ runId: r.id })) };
  }

  if (kind === "renders") {
    const { data } = await db
      .from("video_renders")
      .select("id")
      .eq("status", "queued")
      .lte("updated_at", ago(2 * 60_000))
      .gte("updated_at", ago(86_400_000))
      .order("updated_at")
      .limit(limit);
    // Watchdogs so nothing spins forever (retry is user-driven, with a notification):
    // - composing > 12 min: the renderer lost the job (e.g. it restarted)
    // - anything rendering > 45 min
    const { data: lost } = await db
      .from("video_renders")
      .select("id")
      .eq("status", "rendering")
      .eq("phase", "compose")
      .lte("updated_at", ago(12 * 60_000));
    for (const r of lost ?? []) await failRender(r.id, "The renderer didn't finish this video (it may have restarted) — please retry");
    const { data: stale } = await db
      .from("video_renders")
      .select("id")
      .eq("status", "rendering")
      .lte("updated_at", ago(45 * 60_000));
    for (const r of stale ?? []) await failRender(r.id, "Render timed out");
    return { kind, jobs: (data ?? []).map((r) => ({ renderId: r.id })) };
  }

  if (kind === "publish") {
    const { data } = await db
      .from("publish_jobs")
      .select("id, project_id, projects!inner(status)")
      .eq("status", "scheduled")
      .lte("scheduled_for", now)
      .eq("projects.status", "live")
      .order("scheduled_for")
      .limit(limit);
    return { kind, jobs: (data ?? []).map((j) => ({ publishJobId: j.id })) };
  }

  if (kind === "analytics") {
    const { data } = await db
      .from("publish_jobs")
      .select("id")
      .eq("status", "published")
      .gte("published_at", ago(30 * 86_400_000))
      .limit(limit);
    return { kind, jobs: (data ?? []).map((j) => ({ publishJobId: j.id })) };
  }

  // notifications: lease pending rows by flipping them to "sending"
  const { data: pending } = await db
    .from("notifications")
    .select("id")
    .eq("delivery_state", "pending")
    .order("created_at")
    .limit(limit);
  const ids = (pending ?? []).map((n) => n.id);
  if (!ids.length) return { kind, jobs: [] };
  const { data: leased } = await db
    .from("notifications")
    .update({ delivery_state: "sending" })
    .in("id", ids)
    .eq("delivery_state", "pending")
    .select("id");
  return { kind, jobs: (leased ?? []).map((n) => ({ notificationId: n.id })) };
}

// ---------------------------------------------------------------------------
// Project agent chat (WF-A1)
// ---------------------------------------------------------------------------
export async function agentContext(conversationId: string) {
  const db = admin();
  const { data: convo } = await db.from("conversations").select("*").eq("id", conversationId).maybeSingle();
  if (!convo?.project_id) throw notFound("Conversation");
  const { data: project } = await db.from("projects").select("*").eq("id", convo.project_id).single();
  const p = project as ProjectRow;
  const { data: msgs } = await db
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(16);
  // Same numbering as the page and "revise #n": rejected ideas are left out.
  const { data: contents } = await db.from("contents").select("options, selection, status").eq("project_id", p.id).neq("status", "removed").order("position");
  // Duplicate check (code, not the model): the latest request vs this project's content.
  const recent = (msgs ?? []).slice(0, 2).map((m) => m.content).join("\n");
  const similar = recent.trim() ? await findSimilarContents(p.id, recent) : [];
  return {
    conversationId,
    projectId: p.id,
    project: { title: p.title, summary: p.summary, status: p.status, creativeKit: projectKit(p), schedule: p.schedule },
    contents: (contents ?? []).map((c: Pick<ContentRow, "options" | "selection" | "status">) => ({
      title: resolveContent(c.options, c.selection).title,
      status: c.status,
    })),
    history: (msgs ?? []).reverse(),
    /** Existing content close to what the creator is asking for. duplicate = same video. */
    similarContents: similar.map((c) => ({ number: c.number, title: c.title, hook: c.hook, score: c.score, duplicate: c.score >= CONTENT_DUPLICATE })),
  };
}

export const AgentReplySchema = z.object({
  conversationId: z.string().uuid(),
  reply: z.string().min(1).max(4000),
  action: z
    .object({
      type: z.enum(["none", "generate_more", "revise"]),
      count: z.coerce.number().int().min(0).max(8).optional(),
      feedback: z.string().max(1500).optional(),
    })
    .optional(),
  /** Quick replies shown under the message (e.g. different angles). */
  chips: z.array(z.string().max(80)).max(4).optional(),
});

export async function agentReply(raw: unknown) {
  const input = AgentReplySchema.parse(raw);
  const db = admin();
  const { data: convo } = await db.from("conversations").select("owner_id, project_id").eq("id", input.conversationId).single();
  if (!convo?.project_id) throw notFound("Conversation");
  await db.from("messages").insert({
    conversation_id: input.conversationId,
    owner_id: convo.owner_id,
    role: "assistant",
    content: input.reply,
    meta: input.chips?.length ? { chips: input.chips } : null,
  });
  try {
    if (input.action?.type === "generate_more") {
      // feedback = the creator's brief (their idea / chosen angle) for the new content.
      await generateMore(convo.owner_id, convo.project_id, Math.max(1, input.action.count ?? 3), "web", input.action.feedback?.trim() || undefined);
    } else if (input.action?.type === "revise" && input.action.feedback?.trim()) {
      await reviseContents(convo.owner_id, convo.project_id, input.action.feedback);
    }
  } catch (e) {
    if (!(e instanceof AppError)) throw e;
    await db.from("messages").insert({ conversation_id: input.conversationId, owner_id: convo.owner_id, role: "assistant", content: `⚠️ ${e.message}` });
  }
  return { ok: true };
}

export async function recordWorkflowError(raw: unknown) {
  const input = z
    .object({
      workflow: z.string().default("unknown"),
      executionId: z.coerce.string().optional(),
      node: z.string().optional(),
      message: z.string().default("Unknown error"),
    })
    .parse(raw);
  await admin().from("workflow_errors").insert({
    workflow: input.workflow,
    execution_id: input.executionId ?? null,
    node: input.node ?? null,
    message: input.message.slice(0, 2000),
  });
  return { ok: true };
}

export function assertConflictFree(cond: boolean, message: string) {
  if (!cond) throw conflict(message);
}
