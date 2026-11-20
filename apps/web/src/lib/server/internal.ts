import "server-only";
import {
  AppError,
  ErrorCodes,
  GenerationCompleteSchema,
  conflict,
  notFound,
  resolveContent,
} from "@acs/domain";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity, notifyTelegram, postAssistantMessage } from "./events";
import { generateMore, startProject } from "./projects";
import type { ContentRow, ProjectRow, RunRow } from "./rows";
import { appUrl } from "./session";

const admin = () => createAdminClient();

const STAGE_LABELS: Record<string, string> = {
  understanding: "Understanding your idea",
  research: "Researching angles",
  creative_kit: "Creating the Creative Kit",
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

  return {
    runId,
    skip: false as const,
    kind: r.kind,
    contentCount: r.content_count,
    projectId: p.id,
    prompt: p.prompt,
    title: p.title,
    creativeKit: p.creative_kit,
    existingTitles,
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

  if (payload.project && r.kind === "project_setup") {
    await db
      .from("projects")
      .update({
        title: payload.project.title,
        summary: payload.project.summary,
        cover_emoji: payload.project.emoji ?? null,
        creative_kit: payload.project.creativeKit,
      })
      .eq("id", p.id);
    if (payload.project.research.length) {
      await db.from("research_notes").insert({
        owner_id: p.owner_id,
        project_id: p.id,
        source: "openai.angles",
        payload: { angles: payload.project.research },
      });
    }
  }

  const { data: last } = await db
    .from("contents")
    .select("position")
    .eq("project_id", p.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const start = (last?.position ?? -1) + 1;

  const { error } = await db.from("contents").insert(
    payload.contents.map((c, i) => ({
      owner_id: p.owner_id,
      project_id: p.id,
      run_id: r.id,
      position: start + i,
      options: c.options,
      selection: {},
      scenes: c.scenes,
      video_prompt: c.videoPrompt,
    })),
  );
  if (error) throw new AppError(ErrorCodes.INTERNAL_ERROR, "Could not save generated content", 500);

  await db
    .from("generation_runs")
    .update({ status: "succeeded", stage: "done", progress: 100, finished_at: new Date().toISOString() })
    .eq("id", r.id);
  if (p.status === "generating") await db.from("projects").update({ status: "draft" }).eq("id", p.id);

  const n = payload.contents.length;
  const title = payload.project?.title ?? p.title;
  if (r.kind === "project_setup") {
    await logActivity(db, { ownerId: p.owner_id, projectId: p.id, kind: "generation.done", message: `Generated ${n} content ideas` });
    await postAssistantMessage(
      db,
      p.owner_id,
      p.id,
      `Your project is ready: ${n} content ideas, each with a few options per field. Pick your favourites, approve all, set a schedule and activate.`,
    );
    await notifyTelegram(db, {
      ownerId: p.owner_id,
      projectId: p.id,
      template: "project.ready",
      text: `✨ "${title}" is ready — ${n} content ideas to review.`,
      path: `/projects/${p.id}?tab=content`,
    });
  } else {
    await logActivity(db, { ownerId: p.owner_id, projectId: p.id, kind: "ideation.done", message: `${n} new content ideas to review` });
    await notifyTelegram(db, {
      ownerId: p.owner_id,
      projectId: p.id,
      template: "ideation.ready",
      text: `💡 ${n} new ideas for "${title}" are waiting for your approval.`,
      path: `/projects/${p.id}?tab=content`,
    });
  }
  return { runId: r.id, contents: n };
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
  const { data: project } = await db.from("projects").select("status, owner_id").eq("id", r.project_id).single();
  if (project?.status === "generating") await db.from("projects").update({ status: "failed" }).eq("id", r.project_id);
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
    // 1) recurring ideation for active projects that are due
    const { data: due } = await db
      .from("projects")
      .select("id, owner_id, ideation_every_days")
      .eq("status", "active")
      .eq("ideation_enabled", true)
      .lte("next_ideation_at", now)
      .limit(limit);
    for (const p of due ?? []) {
      const next = new Date(Date.now() + p.ideation_every_days * 86_400_000).toISOString();
      const { data: bumped } = await db
        .from("projects")
        .update({ next_ideation_at: next })
        .eq("id", p.id)
        .lte("next_ideation_at", now)
        .select("id")
        .maybeSingle();
      if (bumped) await generateMore(p.owner_id, p.id, 3);
    }
    // 2) queued runs the webhook never started (> 1 min, < 1 day)
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
    // renders stuck "rendering" > 45 min: fail them (retry is user-driven)
    await db
      .from("video_renders")
      .update({ status: "failed", error: "Render timed out" })
      .eq("status", "rendering")
      .lte("updated_at", ago(45 * 60_000));
    return { kind, jobs: (data ?? []).map((r) => ({ renderId: r.id })) };
  }

  if (kind === "publish") {
    const { data } = await db
      .from("publish_jobs")
      .select("id, project_id, projects!inner(status)")
      .eq("status", "scheduled")
      .lte("scheduled_for", now)
      .eq("projects.status", "active")
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
    .select("id, payload");
  return {
    kind,
    jobs: (leased ?? []).map((n) => ({
      notificationId: n.id,
      chatId: n.payload?.chatId ?? "",
      text: n.payload?.text ?? "",
      url: n.payload?.url ?? "",
    })),
  };
}

export async function completeNotification(input: { notificationId: string; delivered: boolean }) {
  await admin()
    .from("notifications")
    .update({
      delivery_state: input.delivered ? "delivered" : "failed",
      delivered_at: input.delivered ? new Date().toISOString() : null,
    })
    .eq("id", input.notificationId);
  return { ok: true };
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
  const { data: contents } = await db.from("contents").select("options, selection, status").eq("project_id", p.id).order("position");
  return {
    conversationId,
    projectId: p.id,
    project: { title: p.title, summary: p.summary, status: p.status, creativeKit: p.creative_kit, schedule: p.schedule },
    contents: (contents ?? []).map((c: Pick<ContentRow, "options" | "selection" | "status">) => ({
      title: resolveContent(c.options, c.selection).title,
      status: c.status,
    })),
    history: (msgs ?? []).reverse(),
  };
}

export const AgentReplySchema = z.object({
  conversationId: z.string().uuid(),
  reply: z.string().min(1).max(4000),
  action: z
    .object({ type: z.enum(["none", "generate_more"]), count: z.coerce.number().int().min(1).max(8).optional() })
    .optional(),
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
  });
  if (input.action?.type === "generate_more") {
    try {
      await generateMore(convo.owner_id, convo.project_id, input.action.count ?? 3);
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Telegram (WF-A2): a linked user's message starts a new project
// ---------------------------------------------------------------------------
export const TelegramIntakeSchema = z.object({
  telegramUserId: z.coerce.string().min(1),
  chatId: z.coerce.string().min(1),
  text: z.string().default(""),
});

export async function telegramIntake(raw: unknown) {
  const input = TelegramIntakeSchema.parse(raw);
  const db = admin();
  const { data: link } = await db
    .from("telegram_links")
    .select("id, owner_id, telegram_chat_id")
    .eq("telegram_user_id", input.telegramUserId)
    .is("revoked_at", null)
    .maybeSingle();

  if (!link) {
    return {
      linked: false,
      reply: `Your Telegram isn't linked yet. In Studio open Settings → Telegram and enter your user ID ${input.telegramUserId}, then message me again.\n${appUrl()}/settings?section=telegram`,
    };
  }
  if (!link.telegram_chat_id || String(link.telegram_chat_id) !== input.chatId) {
    await db.from("telegram_links").update({ telegram_chat_id: Number(input.chatId) }).eq("id", link.id);
  }

  const text = input.text.trim();
  if (!text || text === "/start") {
    return { linked: true, reply: "Hi! Send me an idea (e.g. \"weekly cat stories for kids\") and I'll create a project for it." };
  }
  try {
    const { projectId } = await startProject({ ownerId: link.owner_id, prompt: text, channel: "telegram" });
    return {
      linked: true,
      projectId,
      reply: `On it — creating your project now. I'll message you when the content is ready to review.\n${appUrl()}/projects/${projectId}`,
    };
  } catch (e) {
    if (e instanceof AppError) return { linked: true, reply: e.message };
    throw e;
  }
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
