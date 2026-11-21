import "server-only";
import {
  AppError,
  ErrorCodes,
  SetupCompleteSchema,
  conflict,
  nextSetupStage,
  notFound,
  parseEnding,
  endingBrief,
  resolveContent,
  type ContentPlan,
  type ContentStage,
  type MessageMeta,
  type SetupStage,
  type SetupTask,
} from "@acs/domain";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SIMILAR_STRONG, findSimilarProjects, type SimilarProject } from "./similar";
import { dispatchToN8n } from "./dispatch";
import { queueGeneration } from "./projects";
import { logActivity, postAssistantMessage } from "./events";
import type { ProjectRow } from "./rows";

/**
 * The agent-guided part of a project (docs/FLOW.md), all run by n8n WF-05:
 *   project setup: similar check → concept → kit → pillars   (status "setup")
 *   content setup: plan (content concepts) → storyboard       (status "draft", content_stage)
 * Each step shows its result and waits for "continue" or a refine — unless the
 * creator turned on auto, which runs the project setup through to the plan.
 */
const admin = () => createAdminClient();
/** An agent run older than this is considered lost and can be retried. */
const STALE_MS = 3 * 60_000;

type SetupProject = ProjectRow & { setup_stage: SetupStage; setup_busy: boolean; setup_started_at: string | null; content_stage?: ContentStage };

/** The step the agent is on, or null once the project is in production. */
export function agentStage(p: Pick<SetupProject, "status" | "setup_stage" | "content_stage">): SetupStage | "plan" | "storyboard" | null {
  if (p.status === "setup") return p.setup_stage;
  if (p.content_stage === "plan" || p.content_stage === "storyboard") return p.content_stage;
  return null;
}

async function loadSetupProject(ownerId: string, projectId: string): Promise<SetupProject> {
  const { data } = await admin().from("projects").select("*").eq("id", projectId).eq("owner_id", ownerId).maybeSingle();
  if (!data) throw notFound("Project");
  return data as SetupProject;
}

export function setupStale(p: Pick<SetupProject, "setup_busy" | "setup_started_at">) {
  return Boolean(p.setup_busy && p.setup_started_at && Date.now() - new Date(p.setup_started_at).getTime() > STALE_MS);
}

/** Marks the agent busy and sends the task to n8n. */
async function runTask(projectId: string, task: SetupTask, feedback = "") {
  await admin().from("projects").update({ setup_busy: true, setup_started_at: new Date().toISOString() }).eq("id", projectId);
  dispatchToN8n("setup", { projectId, task, feedback });
}

async function webConversation(projectId: string) {
  const { data } = await admin().from("conversations").select("id").eq("project_id", projectId).eq("channel", "web").order("created_at").limit(1).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** New project in setup: the creator's rough idea opens a discovery chat. */
export async function startSetup(ownerId: string, prompt: string, opts: { auto?: boolean } = {}) {
  const text = prompt.trim();
  if (text.length < 4) throw new AppError(ErrorCodes.VALIDATION_ERROR, "Tell the agent a bit more about your idea", 400);
  const db = admin();
  // A project is only kept once the agent has made its concept; drop abandoned drafts.
  await db
    .from("projects")
    .delete()
    .eq("owner_id", ownerId)
    .eq("status", "setup")
    .is("concept->>title", null)
    .lt("created_at", new Date(Date.now() - 60 * 60_000).toISOString());
  const { data: project, error } = await db
    .from("projects")
    .insert({
      owner_id: ownerId,
      idea: text,
      title: text.length > 60 ? `${text.slice(0, 57)}…` : text,
      cover_tone: Math.floor(Math.random() * 4),
      status: "setup",
      setup_stage: "similar",
      auto_approve: Boolean(opts.auto),
    })
    .select("id")
    .single();
  if (error || !project) throw new AppError(ErrorCodes.INTERNAL_ERROR, "Could not create project", 500);
  const { data: convo } = await db
    .from("conversations")
    .insert({ owner_id: ownerId, project_id: project.id, channel: "web", title: "Project conversation" })
    .select("id")
    .single();
  if (convo) await db.from("messages").insert({ conversation_id: convo.id, owner_id: ownerId, role: "user", content: text });
  await logActivity(db, { ownerId, projectId: project.id, kind: "project.created", message: "Project started — shaping the idea with the agent" });
  await db.from("projects").update({ setup_busy: true, setup_started_at: new Date().toISOString() }).eq("id", project.id);
  after(() => similarCheck(project.id as string, ownerId, text).catch(() => toConcept(project.id as string)));
  return { projectId: project.id as string };
}

/**
 * First thing for a new idea: is it a duplicate? Strong match → ask "continue
 * there or a different project?" (no AI needed). Borderline → the agent judges.
 * Nothing similar → straight to the concept.
 */
async function similarCheck(projectId: string, ownerId: string, idea: string) {
  const db = admin();
  const matches = await findSimilarProjects(ownerId, projectId, idea);
  await db.from("projects").update({ setup_similar: matches }).eq("id", projectId);
  const top = matches[0];
  // The similar question always stops (also with auto setup): it's the creator's decision.
  if (top && top.score >= SIMILAR_STRONG) {
    await db.from("projects").update({ setup_busy: false }).eq("id", projectId);
    await postAssistantMessage(db, ownerId, projectId, similarQuestion(top.title, top.status), {
      similar: { projectId: top.id, title: top.title },
    });
    return;
  }
  if (top) return runTask(projectId, "chat"); // borderline: let the agent decide
  await toConcept(projectId);
}

async function toConcept(projectId: string) {
  await admin().from("projects").update({ setup_stage: "concept" }).eq("id", projectId);
  await runTask(projectId, "concept");
}

const similarQuestion = (title: string, status: string) =>
  `This looks a lot like your project “${title}”${status === "setup" ? " (still being set up)" : ""}. Continue there, or create a different project?`;

/** A chat message during setup: the agent answers and decides what happens. */
export async function setupMessage(ownerId: string, projectId: string, content: string) {
  const p = await loadSetupProject(ownerId, projectId);
  if (!agentStage(p)) throw conflict("Setup is finished");
  if (p.setup_busy && !setupStale(p)) throw conflict("The agent is still working — one moment");
  const convoId = await webConversation(projectId);
  if (!convoId) throw notFound("Conversation");
  const text = content.trim().slice(0, 4000);
  await admin().from("messages").insert({ conversation_id: convoId, owner_id: ownerId, role: "user", content: text });
  // Project ready, no content yet: any message starts the content plan (its words are the brief).
  if (agentStage(p) === "plan") {
    const { count } = await admin().from("contents").select("id", { count: "exact", head: true }).eq("project_id", projectId).neq("status", "removed");
    if (!count) {
      await runTask(projectId, "plan", /^generate( the)? content\.?$/i.test(text) ? "" : text);
      return { ok: true };
    }
  }
  await runTask(projectId, "chat");
  return { ok: true };
}

/**
 * Buttons on the setup view.
 * - continue: accept the current stage and move on (discovery → concept → kit → pillars → done)
 * - retry: re-run the current stage after a lost or failed run
 * - start_new: dismiss a "similar project" suggestion
 * - use_similar: continue in the similar project instead (this draft is removed)
 */
export async function setupAction(ownerId: string, projectId: string, action: "continue" | "retry" | "start_new" | "use_similar", targetId?: string) {
  const p = await loadSetupProject(ownerId, projectId);
  if (action === "use_similar") return continueInSimilar(p, targetId);
  const stage = agentStage(p);
  if (!stage) throw conflict("Setup is finished");
  if (p.setup_busy && !setupStale(p)) throw conflict("The agent is still working — one moment");
  if (action === "retry") {
    if (stage === "storyboard") return writeStoryboards(p, { onlyFailed: true });
    await runTask(projectId, stage === "similar" ? "chat" : (stage as SetupTask));
    return { stage };
  }
  if (stage === "plan") {
    // No plan yet: the project is ready → generate the content concept.
    const { count } = await admin().from("contents").select("id", { count: "exact", head: true }).eq("project_id", projectId).neq("status", "removed");
    if (!count) {
      await userMessage(ownerId, projectId, "Generate content");
      await runTask(projectId, "plan");
      return { stage };
    }
    await userMessage(ownerId, projectId, "✅ The plan looks good — write the storyboards");
    return writeStoryboards(p, {});
  }
  if (stage === "storyboard") throw conflict("Images & video are the next step — coming soon");
  // Every button press is part of the conversation.
  if (action === "start_new") {
    await userMessage(ownerId, projectId, "Start a new project");
    await postAssistantMessage(admin(), ownerId, projectId, "Got it, a fresh project it is. Let me sketch the concept.");
    return advance(p);
  }
  await userMessage(ownerId, projectId, CONTINUE_TEXT[p.setup_stage] ?? "Continue");
  return advance(p);
}

const CONTINUE_TEXT: Partial<Record<SetupStage, string>> = {
  similar: "Create a different project",
  concept: "✅ Concept looks good — continue to the Creative Kit",
  kit: "✅ Kit looks good — continue to pillars & guardrails",
  pillars: "✅ Lock the project setup",
};

async function userMessage(ownerId: string, projectId: string, content: string) {
  const convoId = await webConversation(projectId);
  if (convoId) await admin().from("messages").insert({ conversation_id: convoId, owner_id: ownerId, role: "user", content });
}

/** Carries the idea into an existing project's chat and removes this empty draft. */
async function continueInSimilar(p: SetupProject, targetId?: string) {
  if (p.setup_stage !== "similar") throw conflict("This project is already being set up");
  const db = admin();
  const { data: target } = await db.from("projects").select("id, status").eq("id", targetId ?? "").eq("owner_id", p.owner_id).maybeSingle();
  if (!target || target.id === p.id) throw notFound("Project");
  await db.from("projects").delete().eq("id", p.id).eq("status", "setup");
  // Open the existing project; nothing is generated until the creator says so.
  await postAssistantMessage(
    db,
    p.owner_id,
    target.id as string,
    `You're back with an idea for this project: “${p.idea}”.\nWant me to turn it into a new content?`,
    { chips: ["Yes, create it", "Not now"] },
  );
  return { redirect: `/projects/${target.id}` };
}

/** Moves to the next stage and starts its generation (or finishes setup). */
async function advance(p: SetupProject) {
  const db = admin();
  const next = nextSetupStage(p.setup_stage);
  if (next === "done") return finishSetup(p);
  await db.from("projects").update({ setup_stage: next, setup_retries: 0 }).eq("id", p.id);
  await runTask(p.id, next as SetupTask);
  return { stage: next };
}

/** Project setup locked → content setup starts with the content plan. */
async function finishSetup(p: SetupProject) {
  const db = admin();
  await db.from("projects").update({ setup_stage: "done", setup_busy: false, status: "draft", content_stage: "plan" }).eq("id", p.id);
  await logActivity(db, { ownerId: p.owner_id, projectId: p.id, kind: "setup.done", message: "Project setup is ready" });
  await postAssistantMessage(db, p.owner_id, p.id, "Your project is ready ✅ The setup is locked. Generate the content when you're ready: I'll decide between one video or a series and write the concept of each.", {
    chips: ["Generate content"],
  });
  return { stage: "done" as const };
}

// ---------------------------------------------------------------------------
// n8n side (service token)
// ---------------------------------------------------------------------------
export async function setupContext(input: { projectId: string; task: SetupTask; feedback?: string }) {
  const db = admin();
  const { data } = await db.from("projects").select("*").eq("id", input.projectId).maybeSingle();
  if (!data) throw notFound("Project");
  const p = data as SetupProject;
  const convoId = await webConversation(p.id);
  const { data: msgs } = convoId
    ? await db.from("messages").select("role, content").eq("conversation_id", convoId).order("created_at", { ascending: false }).limit(20)
    : { data: [] };
  const candidates = ((p as SetupProject & { setup_similar?: SimilarProject[] | null }).setup_similar ?? []).map((c) => ({
    id: c.id,
    title: c.title,
    score: c.score,
    stillInSetup: c.status === "setup",
  }));
  // Projects this one must not overlap with (the similar ones found at the start).
  const { data: avoidRows } = candidates.length
    ? await db.from("projects").select("title, summary, concept, kit").in("id", candidates.map((c) => c.id))
    : { data: [] };
  const avoidProjects = (avoidRows ?? []).map((o) => {
    const oc = (o.concept ?? {}) as { niche?: string; audience?: string };
    const ok = (o.kit ?? {}) as { niche?: string; audience?: string; pillars?: string[] };
    return { title: o.title, niche: oc.niche || ok.niche || "", audience: oc.audience || ok.audience || "", summary: o.summary ?? "", pillars: ok.pillars ?? [] };
  });
  const kit = p.kit ?? {};
  return {
    projectId: p.id,
    task: input.task,
    feedback: input.feedback ?? "",
    stage: agentStage(p) ?? "done",
    /** Language of the chat and the setup cards (the app's language). Scripts use concept.language. */
    appLanguage: "English",
    idea: p.idea,
    history: (msgs ?? []).reverse(),
    concept: p.concept ?? {},
    kit: {
      tone: kit.tone ?? "",
      voice: kit.voice ?? "",
      visualStyle: kit.visualStyle ?? "",
      palette: kit.palette ?? "",
      recurringSubject: kit.recurringSubject ?? "",
      format: kit.format ?? "",
      opening: kit.opening ?? "",
      ending: parseEnding(p.ending),
    },
    pillars: { pillars: kit.pillars ?? [], guardrails: kit.guardrails ?? [] },
    /** Scored by embeddings: ≥0.55 = same idea, 0.35–0.55 = maybe (judge by topic). */
    similarCandidates: candidates,
    /** Existing projects the new concept and pillars must stay clearly different from. */
    avoidProjects,
    /** Content setup: the current plan (refine keeps what the creator did not ask to change). */
    contentPlan: input.task === "plan" || agentStage(p) === "plan" ? await currentPlan(p) : null,
    endingBrief: endingBrief(p.ending, p.title),
  };
}

async function currentPlan(p: SetupProject) {
  const { data } = await admin().from("contents").select("label, options, selection").eq("project_id", p.id).neq("status", "removed").order("position");
  const items = (data ?? []).map((c, i) => {
    const r = resolveContent(c.options, c.selection);
    return { number: i + 1, label: c.label ?? "", title: r.title, hook: r.hook, description: r.caption, hashtags: r.hashtags };
  });
  return { ...((p as SetupProject & { content_plan?: object }).content_plan ?? {}), items };
}

export async function setupComplete(raw: unknown) {
  const parsed = SetupCompleteSchema.safeParse(raw);
  if (!parsed.success) {
    const projectId = (raw as { projectId?: unknown } | null)?.projectId;
    if (typeof projectId === "string") await setupFail({ projectId, error: parsed.error.message });
    return { ok: false, error: "invalid payload" };
  }
  const input = parsed.data;
  const db = admin();
  const { data } = await db.from("projects").select("*").eq("id", input.projectId).maybeSingle();
  if (!data) throw notFound("Project");
  const p = data as SetupProject;
  const stage = agentStage(p);
  if (!stage) return { ok: true, ignored: true };
  const kit = p.kit ?? {};
  const meta: MessageMeta = {};

  if (input.task === "concept" && input.concept) {
    const c = input.concept;
    // No overlap with existing projects: one automatic redo, then a heads-up.
    const overlap = (await findSimilarProjects(p.owner_id, p.id, [c.title, c.niche, c.audience, c.summary].join(". "))).find((m) => m.score >= SIMILAR_STRONG);
    const firstDraft = !(p.concept as { title?: string } | undefined)?.title;
    if (overlap && firstDraft && ((p as SetupProject & { setup_retries?: number }).setup_retries ?? 0) < 1) {
      await db.from("projects").update({ setup_retries: 1, setup_started_at: new Date().toISOString() }).eq("id", p.id);
      dispatchToN8n("setup", {
        projectId: p.id,
        task: "concept",
        feedback: `The draft "${c.title}" (niche: ${c.niche}; audience: ${c.audience}) is too close to the existing project "${overlap.title}". Make the niche angle and the audience clearly different from it, with a new title.`,
      });
      return { ok: true, retried: true };
    }
    if (overlap) input.reply = `${input.reply.trim()}\n\nHeads-up: this still overlaps with your project “${overlap.title}”. Change the niche or audience with ✏️ to keep them apart.`;
    await db
      .from("projects")
      .update({
        concept: c,
        title: c.title || p.title,
        summary: c.summary || p.summary,
        emoji: c.emoji || p.emoji,
      })
      .eq("id", p.id);
    meta.stage = "concept";
    meta.data = c;
  } else if (input.task === "kit" && input.kit) {
    const { ending, ...rest } = input.kit;
    const current = parseEnding(p.ending);
    await db
      .from("projects")
      .update({ kit: { ...kit, ...rest }, ending: { ...current, ...(ending ?? {}) } })
      .eq("id", p.id);
    meta.stage = "kit";
    meta.data = { ...rest, ending: { ...current, ...(ending ?? {}) } };
  } else if (input.task === "pillars" && input.pillars) {
    await db.from("projects").update({ kit: { ...kit, ...input.pillars } }).eq("id", p.id);
    meta.stage = "pillars";
    meta.data = input.pillars;
  } else if (input.task === "plan" && input.plan) {
    await savePlan(p, input.plan);
    meta.data = { format: input.plan.format, style: input.plan.style, count: input.plan.items.length };
  }

  const action = input.action ?? {};
  if (input.task === "chat") {
    if (action.chips?.length) meta.chips = action.chips;
    if (action.type === "similar" && action.projectId) {
      const { data: other } = await db.from("projects").select("id, title").eq("id", action.projectId).eq("owner_id", p.owner_id).maybeSingle();
      if (other) meta.similar = { projectId: other.id as string, title: other.title as string };
    }
  }

  await db.from("projects").update({ setup_busy: false }).eq("id", p.id);
  if (input.reply.trim()) await postAssistantMessage(db, p.owner_id, p.id, input.reply.trim(), Object.keys(meta).length ? { ...meta } : undefined);

  const fresh = { ...p, setup_busy: false };
  // Auto: the project setup runs straight through (concept → kit → pillars → plan).
  if (input.task !== "chat") {
    if (p.auto_approve && p.status === "setup" && ["concept", "kit", "pillars"].includes(input.task)) await advance(fresh);
    return { ok: true };
  }
  // The agent's decision drives the next step.
  const inSetup = p.status === "setup";
  if (action.type === "propose" && stage === "similar") await advance(fresh);
  else if (action.type === "continue" && inSetup && stage !== "similar") await advance(fresh);
  else if (action.type === "continue" && stage === "plan") await writeStoryboards(fresh, {});
  else if (action.type === "refine" && stage === "storyboard" && action.feedback?.trim()) {
    await writeStoryboards(fresh, { feedback: action.feedback.trim() });
  } else if (action.type === "refine" && stage !== "similar" && action.feedback?.trim()) {
    await runTask(p.id, stage as SetupTask, action.feedback.trim());
  }
  return { ok: true };
}

/** n8n failed: free the agent and tell the creator. */
export async function setupFail(input: { projectId: string; error?: string }) {
  const db = admin();
  const { data } = await db.from("projects").select("owner_id, status, setup_stage, content_stage").eq("id", input.projectId).maybeSingle();
  if (!data || !agentStage(data as SetupProject)) return { ok: true };
  await db.from("projects").update({ setup_busy: false }).eq("id", input.projectId);
  await postAssistantMessage(db, data.owner_id as string, input.projectId, "⚠️ I couldn't finish that step. Tap Retry, or tell me again.");
  return { ok: true };
}

/**
 * The content plan replaces the project's idea cards (concept only: title,
 * hook, description, hashtags — scenes come with the storyboard step).
 */
async function savePlan(p: SetupProject, plan: ContentPlan) {
  const db = admin();
  const series = plan.format === "series";
  await db.from("contents").delete().eq("project_id", p.id).eq("status", "idea");
  await db.from("contents").insert(
    plan.items.map((it, i) => ({
      owner_id: p.owner_id,
      project_id: p.id,
      position: i,
      status: "idea",
      label: series ? it.label || (plan.style === "daily" ? `Day ${i + 1}` : `Episode ${i + 1}`) : null,
      options: {
        title: [it.title],
        hook: [it.hook],
        caption: [it.description],
        hashtags: [it.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")],
        script: [],
      },
      selection: {},
      scenes: [],
    })),
  );
  const { items, ...meta } = plan;
  await db.from("projects").update({ content_plan: { ...meta, count: items.length } }).eq("id", p.id);
  await logActivity(db, { ownerId: p.owner_id, projectId: p.id, kind: "plan.ready", message: series ? `Series planned: ${items.length} episodes` : "Content concept ready" });
}

/** Auto turned on mid-setup: if a stage result is waiting, continue right away. */
export async function autoContinue(ownerId: string, projectId: string) {
  const p = await loadSetupProject(ownerId, projectId);
  if (p.status !== "setup" || p.setup_busy || !["concept", "kit", "pillars"].includes(p.setup_stage)) return;
  const ready = p.setup_stage === "concept" ? Boolean(p.concept?.title) : p.setup_stage === "kit" ? Boolean(p.kit?.tone) : Boolean(p.kit?.pillars?.length);
  if (ready) await advance(p);
}

/**
 * Storyboards: one WF-01 run per content (kind "storyboard") writes its script
 * and scenes; cards fill in one by one. With feedback, only the contents it
 * names are rewritten (Day 2, Episode 3, #4…); a single video is always the one.
 */
async function writeStoryboards(p: SetupProject, opts: { feedback?: string; onlyFailed?: boolean }) {
  const db = admin();
  const { data } = await db.from("contents").select("id, label, script_status").eq("project_id", p.id).neq("status", "removed").order("position");
  const list = data ?? [];
  let targets = opts.onlyFailed ? list.filter((c) => c.script_status === "failed" || c.script_status === "none") : list;
  if (opts.feedback && list.length > 1) {
    const named = pickNamed(list, opts.feedback);
    if (named.length) targets = named;
  }
  if (!targets.length) return { stage: "storyboard" as const, writing: 0 };
  await db.from("projects").update({ content_stage: "storyboard", setup_busy: false }).eq("id", p.id);
  await db.from("contents").update({ script_status: "writing" }).in("id", targets.map((c) => c.id));
  for (const c of targets) {
    await queueGeneration(p.owner_id, p.id, "storyboard", 1, true, { targetIds: [c.id], feedback: opts.feedback });
  }
  if (!opts.feedback && !opts.onlyFailed) {
    await postAssistantMessage(db, p.owner_id, p.id, list.length > 1 ? `Writing the storyboards — scenes and script for all ${list.length} videos. They appear one by one.` : "Writing the storyboard — the scenes and the script.");
  }
  return { stage: "storyboard" as const, writing: targets.length };
}

/** Contents a message names: "Day 2", "Episode 3", "Part 1", "#4". */
function pickNamed<T extends { id: string; label: string | null }>(list: T[], text: string): T[] {
  const t = text.toLowerCase();
  const out = new Set<string>();
  list.forEach((c, i) => {
    const label = (c.label ?? "").toLowerCase();
    if (label && new RegExp(`\\b${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t)) out.add(c.id);
    if (new RegExp(`#\\s*${i + 1}\\b`).test(t)) out.add(c.id);
  });
  return list.filter((c) => out.has(c.id));
}
