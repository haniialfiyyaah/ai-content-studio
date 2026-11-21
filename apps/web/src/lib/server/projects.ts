import "server-only";
import {
  AppError,
  ErrorCodes,
  OPTION_FIELDS,
  ScheduleSchema,
  computeSlots,
  conflict,
  isValidSelection,
  notFound,
  readiness,
  type OptionField,
  type Schedule, inferContentCount, type Ending } from "@acs/domain";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchToN8n } from "./dispatch";
import { queueStoryboards } from "./storyboard";
import { logActivity, notifyTelegram, postAssistantMessage } from "./events";
import type { ContentRow, ProjectRow } from "./rows";

const admin = () => createAdminClient();

async function loadOwnedProject(ownerId: string, projectId: string): Promise<ProjectRow> {
  const { data } = await admin().from("projects").select("*").eq("id", projectId).eq("owner_id", ownerId).maybeSingle();
  if (!data) throw notFound("Project");
  return data as ProjectRow;
}

async function youtubeConnected(ownerId: string): Promise<boolean> {
  const { data } = await admin()
    .from("connected_accounts")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("platform", "youtube")
    .eq("status", "connected")
    .maybeSingle();
  return Boolean(data);
}

// ---------------------------------------------------------------------------
// Start: one prompt → new project + its own conversation + a generation run
// ---------------------------------------------------------------------------
export async function startProject(input: {
  ownerId: string;
  prompt: string;
  contentCount?: number;
  channel?: "web" | "telegram";
  /** Client uploads references first, then calls kickGeneration (scheduler is the backstop). */
  deferGeneration?: boolean;
}) {
  const db = admin();
  const prompt = input.prompt.trim();
  if (prompt.length < 4) throw new AppError(ErrorCodes.VALIDATION_ERROR, "Tell the agent a bit more about your idea", 400);

  const { data: project, error } = await db
    .from("projects")
    .insert({
      owner_id: input.ownerId,
      prompt,
      title: prompt.length > 60 ? `${prompt.slice(0, 57)}…` : prompt,
      cover_tone: Math.floor(Math.random() * 4),
      status: "generating",
    })
    .select("id")
    .single();
  if (error || !project) throw new AppError(ErrorCodes.INTERNAL_ERROR, "Could not create project", 500);

  const { data: convo } = await db
    .from("conversations")
    .insert({ owner_id: input.ownerId, project_id: project.id, channel: "web", title: "Project conversation" })
    .select("id")
    .single();
  if (convo) {
    await db.from("messages").insert([
      { conversation_id: convo.id, owner_id: input.ownerId, role: "user", content: prompt },
      {
        conversation_id: convo.id,
        owner_id: input.ownerId,
        role: "assistant",
        content:
          "I'll research angles, build a Creative Kit and draft your content — each with a few options you can pick from.",
      },
    ]);
  }

  const run = await queueGeneration(input.ownerId, project.id, "project_setup", input.contentCount || inferContentCount(prompt) || 3, !input.deferGeneration, {
    channel: input.channel ?? "web",
  });
  await logActivity(db, {
    ownerId: input.ownerId,
    projectId: project.id,
    kind: "project.created",
    message: input.channel === "telegram" ? "Project started from Telegram" : "Project started from Overview",
  });
  return { projectId: project.id as string, runId: run.id, conversationId: (convo?.id as string) ?? null };
}

export async function queueGeneration(
  ownerId: string,
  projectId: string,
  kind: "project_setup" | "ideation" | "revision",
  contentCount: number,
  dispatch = true,
  extra: { feedback?: string; targetIds?: string[]; channel?: "web" | "telegram" } = {},
) {
  const { data: run, error } = await admin()
    .from("generation_runs")
    .insert({
      owner_id: ownerId,
      project_id: projectId,
      kind,
      content_count: Math.min(Math.max(contentCount, 1), 12),
      stage: "queued",
      feedback: extra.feedback ?? null,
      target_ids: extra.targetIds ?? [],
      channel: extra.channel ?? "web",
    })
    .select("id")
    .single();
  if (error || !run) throw new AppError(ErrorCodes.INTERNAL_ERROR, "Could not queue generation", 500);
  if (dispatch) dispatchToN8n("generate", { runId: run.id });
  return run as { id: string };
}

/** Starts a deferred project_setup run once reference uploads are done. */
export async function kickGeneration(ownerId: string, projectId: string) {
  await loadOwnedProject(ownerId, projectId);
  const { data: run } = await admin()
    .from("generation_runs")
    .select("id")
    .eq("project_id", projectId)
    .eq("status", "queued")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (run) dispatchToN8n("generate", { runId: run.id });
  return { runId: run?.id ?? null };
}

/**
 * Render (or re-render) one approved content now — independent of scheduling,
 * so videos can be downloaded before (or without) activating the project.
 */
export async function requestRender(ownerId: string, contentId: string) {
  const db = admin();
  const { data: content } = await db
    .from("contents")
    .select("id, project_id, status, video_prompt")
    .eq("id", contentId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!content) throw notFound("Content");
  if (content.status !== "approved") throw conflict("Approve the content before rendering");
  const { data: active } = await db
    .from("video_renders")
    .select("id")
    .eq("content_id", contentId)
    .in("status", ["queued", "rendering"])
    .maybeSingle();
  if (active) return { renderId: active.id as string, alreadyRunning: true };
  const { data: created } = await db
    .from("video_renders")
    .insert({ owner_id: ownerId, project_id: content.project_id, content_id: contentId, prompt: content.video_prompt })
    .select("id")
    .single();
  if (!created) throw new AppError(ErrorCodes.INTERNAL_ERROR, "Could not queue render", 500);
  dispatchToN8n("render", { renderId: created.id });
  await logActivity(db, { ownerId, projectId: content.project_id, kind: "render.requested", message: "Video render started" });
  return { renderId: created.id as string, alreadyRunning: false };
}

export async function retryGeneration(ownerId: string, projectId: string) {
  const project = await loadOwnedProject(ownerId, projectId);
  if (project.status !== "failed") throw conflict("Only a failed project can be regenerated");
  await admin().from("projects").update({ status: "generating" }).eq("id", projectId);
  return queueGeneration(ownerId, projectId, "project_setup", 4);
}

export async function generateMore(ownerId: string, projectId: string, count: number, channel: "web" | "telegram" = "web") {
  const project = await loadOwnedProject(ownerId, projectId);
  if (project.status === "generating") throw conflict("The project is still generating");
  return queueGeneration(ownerId, projectId, "ideation", count, true, { channel });
}

/**
 * AI revision: rewrites selected contents from natural-language feedback
 * (e.g. "make #2 funnier"). `#n` numbers pick contents by list position;
 * without numbers every unpublished content is revised. Revised contents go
 * back to draft with fresh options — the user never types into fields.
 */
export async function reviseContents(ownerId: string, projectId: string, feedback: string, channel: "web" | "telegram" = "web") {
  const project = await loadOwnedProject(ownerId, projectId);
  if (project.status === "generating") throw conflict("The project is still generating");
  const db = admin();
  const { data: rows } = await db
    .from("contents")
    .select("id, position")
    .eq("project_id", projectId)
    .neq("status", "archived")
    .order("position");
  const list = rows ?? [];
  const { data: published } = await db.from("publish_jobs").select("content_id").eq("project_id", projectId).eq("status", "published");
  const locked = new Set((published ?? []).map((j) => j.content_id));
  const numbers = [...feedback.matchAll(/#\s*(\d{1,2})/g)].map((m) => Number(m[1]) - 1);
  const picked = (numbers.length ? numbers.map((n) => list[n]).filter(Boolean) : list).filter((c) => !locked.has(c!.id));
  if (!picked.length) throw new AppError(ErrorCodes.VALIDATION_ERROR, "No matching content to revise (published content can't change)", 400);
  const targetIds = [...new Set(picked.map((c) => c!.id))].slice(0, 8);
  const run = await queueGeneration(ownerId, projectId, "revision", targetIds.length, true, {
    feedback: feedback.trim().slice(0, 1500),
    targetIds,
    channel,
  });
  await logActivity(db, { ownerId, projectId, kind: "revision.requested", message: `Revision requested for ${targetIds.length} content` });
  return { runId: run.id, revising: targetIds.length, positions: targetIds.map((id) => list.findIndex((c) => c.id === id) + 1) };
}

// ---------------------------------------------------------------------------
// Review: pick an option per field (no free text), approve everything at once
// ---------------------------------------------------------------------------
export async function selectOption(ownerId: string, contentId: string, field: OptionField, index: number) {
  const db = admin();
  const { data } = await db.from("contents").select("*").eq("id", contentId).eq("owner_id", ownerId).maybeSingle();
  if (!data) throw notFound("Content");
  const content = data as ContentRow;
  if (!OPTION_FIELDS.includes(field) || !isValidSelection(content.options, field, index)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, "Not one of the generated options", 400);
  }
  // Approved content is locked; the user must unlock (which drops approval) first.
  if (content.status !== "draft") throw conflict("This content is approved — unlock it to change options");
  const { data: updated } = await db
    .from("contents")
    .update({ selection: { ...content.selection, [field]: index } })
    .eq("id", contentId)
    .eq("status", "draft")
    .select("id, selection, status")
    .single();
  // The old video no longer matches these picks: retire it so it can't be published.
  if ((content.selection?.[field] ?? 0) !== index) {
    await db.from("video_renders").update({ status: "cancelled" }).eq("content_id", contentId).in("status", ["queued", "ready"]);
  }
  return updated;
}

/** Approve one content (review-one-by-one flow). */
export async function approveContent(ownerId: string, contentId: string) {
  const db = admin();
  const { data } = await db.from("contents").select("id, project_id, status").eq("id", contentId).eq("owner_id", ownerId).maybeSingle();
  if (!data) throw notFound("Content");
  const project = await loadOwnedProject(ownerId, data.project_id);
  if (data.status === "draft") {
    await db.from("contents").update({ status: "approved", approved_at: new Date().toISOString() }).eq("id", contentId).eq("status", "draft");
    await logActivity(db, { ownerId, projectId: data.project_id, kind: "content.approved", message: "Approved 1 content" });
    queueStoryboards([contentId]);
    if (project.status === "active") await scheduleAndQueue(project);
  }
  const { data: next } = await db
    .from("contents")
    .select("id")
    .eq("project_id", data.project_id)
    .eq("status", "draft")
    .order("position")
    .limit(1)
    .maybeSingle();
  return { approved: contentId, nextId: (next?.id as string | undefined) ?? null };
}

/**
 * Reject: the idea is set aside (status archived) — no images, render, slot or
 * upload. Published content can't be rejected. Restore brings it back as a draft.
 */
export async function rejectContent(ownerId: string, contentId: string) {
  const db = admin();
  const { data } = await db.from("contents").select("id, project_id, status").eq("id", contentId).eq("owner_id", ownerId).maybeSingle();
  if (!data) throw notFound("Content");
  const { data: job } = await db.from("publish_jobs").select("status").eq("content_id", contentId).in("status", ["published", "publishing"]).maybeSingle();
  if (job) throw conflict("Published content can't be rejected");
  await db.from("contents").update({ status: "archived", approved_at: null, scheduled_for: null }).eq("id", contentId);
  await db.from("publish_jobs").delete().eq("content_id", contentId).eq("status", "scheduled");
  await db.from("video_renders").update({ status: "cancelled" }).eq("content_id", contentId).eq("status", "queued");
  await logActivity(db, { ownerId, projectId: data.project_id, kind: "content.rejected", message: "Rejected 1 content idea" });
  const { data: next } = await db.from("contents").select("id").eq("project_id", data.project_id).eq("status", "draft").order("position").limit(1).maybeSingle();
  return { rejected: contentId, nextId: (next?.id as string | undefined) ?? null };
}

export async function restoreContent(ownerId: string, contentId: string) {
  const db = admin();
  const { data } = await db.from("contents").select("id, project_id, status").eq("id", contentId).eq("owner_id", ownerId).maybeSingle();
  if (!data) throw notFound("Content");
  if (data.status !== "archived") return { restored: contentId };
  await db.from("contents").update({ status: "draft" }).eq("id", contentId);
  await logActivity(db, { ownerId, projectId: data.project_id, kind: "content.restored", message: "Restored a rejected idea" });
  return { restored: contentId };
}

/**
 * Unlock approved content so its options can change again. Published content
 * (or content currently uploading) can never be unlocked.
 */
export async function unlockContent(ownerId: string, contentId: string) {
  const db = admin();
  const { data } = await db.from("contents").select("id, project_id, status").eq("id", contentId).eq("owner_id", ownerId).maybeSingle();
  if (!data) throw notFound("Content");
  const { data: job } = await db.from("publish_jobs").select("status").eq("content_id", contentId).in("status", ["published", "publishing"]).maybeSingle();
  if (job) throw conflict("Published content can't be changed");
  await db.from("contents").update({ status: "draft", approved_at: null }).eq("id", contentId);
  // A scheduled upload must not publish an unapproved version.
  await db.from("publish_jobs").delete().eq("content_id", contentId).eq("status", "scheduled");
  await logActivity(db, { ownerId, projectId: data.project_id, kind: "content.unlocked", message: "Content unlocked for changes" });
  return { unlocked: contentId };
}

export async function approveAll(ownerId: string, projectId: string) {
  const project = await loadOwnedProject(ownerId, projectId);
  if (project.status === "generating") throw conflict("Wait for generation to finish");
  const db = admin();
  const { data } = await db
    .from("contents")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .eq("status", "draft")
    .select("id");
  const count = data?.length ?? 0;
  if (count) {
    await logActivity(db, { ownerId, projectId, kind: "content.approved", message: `Approved ${count} content` });
    queueStoryboards((data ?? []).map((r) => r.id as string));
  }
  // Active project: newly approved ideas join the schedule immediately.
  if (project.status === "active" && count) await scheduleAndQueue(project);
  return { approved: count };
}

/**
 * The single "Approve & schedule" step: ideas in `exclude` are set aside
 * (rejected, restorable), ideas in `include` are approved, every approved idea
 * gets a slot, and a draft project goes live when YouTube is connected.
 */
export async function launchProject(ownerId: string, projectId: string, input: { include: string[]; exclude: string[] }) {
  const project = await loadOwnedProject(ownerId, projectId);
  if (project.status === "generating") throw conflict("Wait for generation to finish");
  if (project.status === "stopped") throw conflict("Stopped projects can't be scheduled");
  const schedule = ScheduleSchema.safeParse(project.schedule);
  if (!schedule.success) throw new AppError(ErrorCodes.NOT_READY, "Set publishing days and time first", 409);

  const db = admin();
  const exclude = [...new Set(input.exclude)].filter((id) => !input.include.includes(id));
  for (const id of exclude) await rejectContent(ownerId, id).catch(() => undefined);

  const { data: approvedRows } = input.include.length
    ? await db
        .from("contents")
        .update({ status: "approved", approved_at: new Date().toISOString() })
        .eq("project_id", projectId)
        .eq("owner_id", ownerId)
        .eq("status", "draft")
        .in("id", input.include)
        .select("id")
    : { data: [] };
  const approvedNow = (approvedRows ?? []).map((r) => r.id as string);
  if (approvedNow.length) {
    await logActivity(db, { ownerId, projectId, kind: "content.approved", message: `Approved ${approvedNow.length} content` });
    queueStoryboards(approvedNow);
  }

  const { count } = await db.from("contents").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("status", "approved");
  if (!count) throw conflict("Keep at least one idea to schedule");

  const ytOk = await youtubeConnected(ownerId);
  if (project.status === "draft" && ytOk) {
    await activateProject(ownerId, projectId);
    return { approved: approvedNow.length, excluded: exclude.length, status: "active", needsYoutube: false };
  }
  if (project.status === "active") await scheduleAndQueue(project);
  else await assignSlots(projectId, schedule.data, false);
  return { approved: approvedNow.length, excluded: exclude.length, status: project.status, needsYoutube: !ytOk };
}

export async function saveEnding(ownerId: string, projectId: string, ending: Ending) {
  await loadOwnedProject(ownerId, projectId);
  const db = admin();
  await db.from("projects").update({ ending }).eq("id", projectId);
  await logActivity(db, { ownerId, projectId, kind: "ending.updated", message: "Ending settings updated" });
  return { ending };
}

// ---------------------------------------------------------------------------
// Schedule → slots per content
// ---------------------------------------------------------------------------
export async function saveSchedule(ownerId: string, projectId: string, raw: unknown) {
  const schedule = ScheduleSchema.parse(raw);
  const project = await loadOwnedProject(ownerId, projectId);
  const db = admin();
  await db.from("projects").update({ schedule }).eq("id", projectId);
  await assignSlots(projectId, schedule, project.status === "active");
  await logActivity(db, { ownerId, projectId, kind: "schedule.updated", message: "Publishing schedule updated" });
  return { schedule };
}

/** Gives every approved, unpublished content a slot in position order. */
async function assignSlots(projectId: string, schedule: Schedule, syncJobs: boolean) {
  const db = admin();
  const { data: rows } = await db
    .from("contents")
    .select("id, position, status")
    .eq("project_id", projectId)
    .neq("status", "archived")
    .order("position");
  const { data: published } = await db
    .from("publish_jobs")
    .select("content_id")
    .eq("project_id", projectId)
    .in("status", ["published", "publishing"]);
  const done = new Set((published ?? []).map((p) => p.content_id));
  // Approved content takes the earliest slots; pending (skipped) ones queue after them.
  const open = (rows ?? []).filter((r) => !done.has(r.id));
  const pending = [...open.filter((r) => r.status === "approved"), ...open.filter((r) => r.status !== "approved")];
  const slots = computeSlots(schedule, pending.length);

  await Promise.all(
    pending.map((c, i) =>
      db.from("contents").update({ scheduled_for: slots[i]?.toISOString() ?? null }).eq("id", c.id),
    ),
  );
  if (syncJobs) {
    await Promise.all(
      pending.map((c, i) =>
        slots[i]
          ? db
              .from("publish_jobs")
              .update({ scheduled_for: slots[i].toISOString() })
              .eq("content_id", c.id)
              .eq("status", "scheduled")
          : Promise.resolve(),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
export async function projectReadiness(ownerId: string, project: ProjectRow) {
  const { data } = await admin().from("contents").select("status").eq("project_id", project.id).neq("status", "archived");
  const contents = data ?? [];
  return readiness({
    status: project.status,
    contentCount: contents.length,
    approvedCount: contents.filter((c) => c.status === "approved").length,
    hasSchedule: ScheduleSchema.safeParse(project.schedule).success,
    youtubeConnected: await youtubeConnected(ownerId),
  });
}

export async function activateProject(ownerId: string, projectId: string) {
  const project = await loadOwnedProject(ownerId, projectId);
  const { canActivate, steps } = await projectReadiness(ownerId, project);
  if (!canActivate) {
    throw new AppError(ErrorCodes.NOT_READY, "Project is not ready to activate", 409, {
      missing: steps.filter((s) => !s.done).map((s) => s.label),
    });
  }
  const db = admin();
  const now = new Date();
  await db
    .from("projects")
    .update({
      status: "active",
      activated_at: now.toISOString(),
      next_ideation_at: project.ideation_enabled
        ? new Date(now.getTime() + project.ideation_every_days * 86_400_000).toISOString()
        : null,
    })
    .eq("id", projectId);
  const queued = await scheduleAndQueue({ ...project, status: "active" });

  await logActivity(db, {
    ownerId,
    projectId,
    kind: "project.activated",
    message: `Activated — rendering ${queued} videos and scheduling uploads`,
  });
  await postAssistantMessage(
    db,
    ownerId,
    projectId,
    `Project is active. I'm rendering ${queued} videos now; each one is uploaded to YouTube at its scheduled time.`,
  );
  await notifyTelegram(db, {
    ownerId,
    projectId,
    template: "project.activated",
    text: `🚀 "${project.title}" is active. Rendering ${queued} videos — I'll message you as each one is ready.`,
    path: `/projects/${projectId}`,
  });
  return { status: "active", renders: queued };
}

/**
 * For each approved content: ensure a render (queued unless one is ready or in
 * flight) and a scheduled publish job at its slot. Idempotent.
 */
async function scheduleAndQueue(project: ProjectRow): Promise<number> {
  const db = admin();
  const schedule = ScheduleSchema.parse(project.schedule);
  await assignSlots(project.id, schedule, true);

  const { data: rows } = await db
    .from("contents")
    .select("id, scheduled_for, video_prompt")
    .eq("project_id", project.id)
    .eq("status", "approved")
    .order("position");
  const contents = rows ?? [];
  if (!contents.length) return 0;

  const ids = contents.map((c) => c.id);
  const { data: renders } = await db
    .from("video_renders")
    .select("content_id, status")
    .in("content_id", ids)
    .in("status", ["queued", "rendering", "ready"]);
  const hasRender = new Set((renders ?? []).map((r) => r.content_id));

  const toQueue = contents.filter((c) => !hasRender.has(c.id));
  if (toQueue.length) {
    const { data: created } = await db
      .from("video_renders")
      .insert(
        toQueue.map((c) => ({
          owner_id: project.owner_id,
          project_id: project.id,
          content_id: c.id,
          prompt: c.video_prompt,
          status: "queued",
        })),
      )
      .select("id");
    for (const r of created ?? []) dispatchToN8n("render", { renderId: r.id });
  }

  await db.from("publish_jobs").upsert(
    contents
      .filter((c) => c.scheduled_for)
      .map((c) => ({
        owner_id: project.owner_id,
        project_id: project.id,
        content_id: c.id,
        platform: "youtube",
        scheduled_for: c.scheduled_for,
      })),
    { onConflict: "content_id,platform", ignoreDuplicates: true },
  );
  return toQueue.length;
}

export async function setLifecycle(ownerId: string, projectId: string, action: "pause" | "resume" | "stop") {
  const project = await loadOwnedProject(ownerId, projectId);
  const allowed: Record<typeof action, string[]> = {
    pause: ["active"],
    resume: ["paused"],
    stop: ["active", "paused"],
  };
  if (!allowed[action].includes(project.status)) throw conflict(`Cannot ${action} a ${project.status} project`);
  const next = { pause: "paused", resume: "active", stop: "stopped" }[action];
  const db = admin();
  await db.from("projects").update({ status: next }).eq("id", projectId);
  if (action === "stop") {
    await db.from("publish_jobs").update({ status: "cancelled" }).eq("project_id", projectId).eq("status", "scheduled");
    await db.from("video_renders").update({ status: "cancelled" }).eq("project_id", projectId).eq("status", "queued");
  }
  await logActivity(db, { ownerId, projectId, kind: `project.${action}`, message: `Project ${next}` });
  return { status: next };
}

export async function updateAutomation(ownerId: string, projectId: string, input: { ideationEnabled: boolean; everyDays: number }) {
  const project = await loadOwnedProject(ownerId, projectId);
  const everyDays = Math.min(Math.max(Math.round(input.everyDays), 1), 60);
  await admin()
    .from("projects")
    .update({
      ideation_enabled: input.ideationEnabled,
      ideation_every_days: everyDays,
      next_ideation_at:
        input.ideationEnabled && project.status === "active"
          ? new Date(Date.now() + everyDays * 86_400_000).toISOString()
          : null,
    })
    .eq("id", projectId);
  return { ideationEnabled: input.ideationEnabled, everyDays };
}

export async function retryRender(ownerId: string, renderId: string) {
  const db = admin();
  const { data } = await db
    .from("video_renders")
    .select("id, status, content_id, project_id, prompt")
    .eq("id", renderId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!data) throw notFound("Render");
  if (data.status !== "failed") throw conflict("Only failed renders can be retried");
  const { data: created } = await db
    .from("video_renders")
    .insert({ owner_id: ownerId, project_id: data.project_id, content_id: data.content_id, prompt: data.prompt })
    .select("id")
    .single();
  if (created) dispatchToN8n("render", { renderId: created.id });
  return { renderId: created?.id };
}

export async function sendProjectMessage(ownerId: string, projectId: string, content: string) {
  await loadOwnedProject(ownerId, projectId);
  const db = admin();
  const { data: convo } = await db
    .from("conversations")
    .select("id")
    .eq("project_id", projectId)
    .eq("channel", "web")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!convo) throw notFound("Conversation");
  const { data: msg } = await db
    .from("messages")
    .insert({ conversation_id: convo.id, owner_id: ownerId, role: "user", content: content.trim().slice(0, 4000) })
    .select("id")
    .single();
  dispatchToN8n("agent-chat", { conversationId: convo.id, messageId: msg?.id });
  return { conversationId: convo.id, messageId: msg?.id };
}

/** Render every approved content that has no queued/rendering/ready video yet. */
export async function renderAllApproved(ownerId: string, projectId: string) {
  await loadOwnedProject(ownerId, projectId);
  const db = admin();
  const { data: approved } = await db.from("contents").select("id").eq("project_id", projectId).eq("status", "approved").order("position");
  const { data: have } = await db
    .from("video_renders")
    .select("content_id")
    .eq("project_id", projectId)
    .in("status", ["queued", "rendering", "ready"]);
  const done = new Set((have ?? []).map((r) => r.content_id));
  const todo = (approved ?? []).filter((c) => !done.has(c.id));
  for (const c of todo) await requestRender(ownerId, c.id);
  return { rendering: todo.length };
}
