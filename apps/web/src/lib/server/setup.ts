import "server-only";
import {
  AppError,
  ErrorCodes,
  SetupCompleteSchema,
  conflict,
  inferContentCount,
  nextSetupStage,
  notFound,
  parseEnding,
  type MessageMeta,
  type SetupStage,
  type SetupTask,
} from "@acs/domain";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SIMILAR_STRONG, findSimilarProjects, type SimilarProject } from "./similar";
import { dispatchToN8n } from "./dispatch";
import { logActivity, postAssistantMessage } from "./events";
import { queueGeneration } from "./projects";
import type { ProjectRow } from "./rows";

/**
 * Guided setup (docs/FLOW.md): Discovery → Concept → Creative Kit → Pillars &
 * guardrails. Each stage shows its result and waits for "continue" or a
 * refine. The AI work runs in n8n WF-05 (webhook acs-setup).
 */
const admin = () => createAdminClient();
/** An agent run older than this is considered lost and can be retried. */
const STALE_MS = 3 * 60_000;

type SetupProject = ProjectRow & { setup_stage: SetupStage; setup_busy: boolean; setup_started_at: string | null };

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
export async function startSetup(ownerId: string, prompt: string) {
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
      prompt: text,
      title: text.length > 60 ? `${text.slice(0, 57)}…` : text,
      cover_tone: Math.floor(Math.random() * 4),
      status: "setup",
      setup_stage: "discovery",
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
  if (p.status !== "setup") throw conflict("Setup is finished");
  if (p.setup_busy && !setupStale(p)) throw conflict("The agent is still working — one moment");
  const convoId = await webConversation(projectId);
  if (!convoId) throw notFound("Conversation");
  await admin().from("messages").insert({ conversation_id: convoId, owner_id: ownerId, role: "user", content: content.trim().slice(0, 4000) });
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
  if (p.status !== "setup") throw conflict("Setup is finished");
  if (p.setup_busy && !setupStale(p)) throw conflict("The agent is still working — one moment");
  if (action === "retry") {
    await runTask(projectId, p.setup_stage === "discovery" ? "chat" : (p.setup_stage as SetupTask));
    return { stage: p.setup_stage };
  }
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
  discovery: "Create a different project",
  concept: "✅ Concept looks good — continue to the Creative Kit",
  kit: "✅ Kit looks good — continue to pillars & guardrails",
  pillars: "✅ Lock the setup and draft my first content",
};

async function userMessage(ownerId: string, projectId: string, content: string) {
  const convoId = await webConversation(projectId);
  if (convoId) await admin().from("messages").insert({ conversation_id: convoId, owner_id: ownerId, role: "user", content });
}

/** Carries the idea into an existing project's chat and removes this empty draft. */
async function continueInSimilar(p: SetupProject, targetId?: string) {
  if (p.setup_stage !== "discovery") throw conflict("This project is already being set up");
  const db = admin();
  const { data: target } = await db.from("projects").select("id, status").eq("id", targetId ?? "").eq("owner_id", p.owner_id).maybeSingle();
  if (!target || target.id === p.id) throw notFound("Project");
  await db.from("projects").delete().eq("id", p.id).eq("status", "setup");
  // Open the existing project; nothing is generated until the creator says so.
  await postAssistantMessage(
    db,
    p.owner_id,
    target.id as string,
    `You're back with an idea for this project: “${p.prompt}”.\nWant me to turn it into a new content?`,
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

/** Setup confirmed → the existing idea generation takes over (phase 2 replaces this). */
async function finishSetup(p: SetupProject) {
  const db = admin();
  await db.from("projects").update({ setup_stage: "done", setup_busy: false, status: "generating" }).eq("id", p.id);
  await logActivity(db, { ownerId: p.owner_id, projectId: p.id, kind: "setup.done", message: "Setup confirmed — drafting content" });
  await postAssistantMessage(db, p.owner_id, p.id, "Setup locked in ✅ Now I'm drafting your first content from it.");
  await queueGeneration(p.owner_id, p.id, "ideation", inferContentCount(p.prompt) || 3);
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
    ? await db.from("projects").select("title, summary, concept, creative_kit").in("id", candidates.map((c) => c.id))
    : { data: [] };
  const avoidProjects = (avoidRows ?? []).map((o) => {
    const oc = (o.concept ?? {}) as { niche?: string; audience?: string };
    const ok = (o.creative_kit ?? {}) as { niche?: string; audience?: string; pillars?: string[] };
    return { title: o.title, niche: oc.niche || ok.niche || "", audience: oc.audience || ok.audience || "", summary: o.summary ?? "", pillars: ok.pillars ?? [] };
  });
  const kit = p.creative_kit ?? {};
  return {
    projectId: p.id,
    task: input.task,
    feedback: input.feedback ?? "",
    stage: p.setup_stage,
    /** Language of the chat and the setup cards (the app's language). Scripts use concept.language. */
    appLanguage: "English",
    idea: p.prompt,
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
  };
}

export async function setupComplete(raw: unknown) {
  const input = SetupCompleteSchema.parse(raw);
  const db = admin();
  const { data } = await db.from("projects").select("*").eq("id", input.projectId).maybeSingle();
  if (!data) throw notFound("Project");
  const p = data as SetupProject;
  if (p.status !== "setup") return { ok: true, ignored: true };
  const kit = p.creative_kit ?? {};
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
        cover_emoji: c.emoji || p.cover_emoji,
        // Downstream steps (WF-01, renderer) read the flattened kit.
        creative_kit: { ...kit, niche: c.niche, goal: c.goal, audience: c.audience, language: c.language },
      })
      .eq("id", p.id);
    meta.stage = "concept";
    meta.data = c;
  } else if (input.task === "kit" && input.kit) {
    const { ending, ...rest } = input.kit;
    const current = parseEnding(p.ending);
    await db
      .from("projects")
      .update({ creative_kit: { ...kit, ...rest }, ending: { ...current, ...(ending ?? {}) } })
      .eq("id", p.id);
    meta.stage = "kit";
    meta.data = { ...rest, ending: { ...current, ...(ending ?? {}) } };
  } else if (input.task === "pillars" && input.pillars) {
    await db.from("projects").update({ creative_kit: { ...kit, ...input.pillars } }).eq("id", p.id);
    meta.stage = "pillars";
    meta.data = input.pillars;
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

  if (input.task !== "chat") return { ok: true };
  // The agent's decision drives the next step.
  const fresh = { ...p, setup_busy: false };
  if (action.type === "propose" && p.setup_stage === "discovery") await advance(fresh);
  else if (action.type === "continue" && p.setup_stage !== "discovery") await advance(fresh);
  else if (action.type === "refine" && p.setup_stage !== "discovery" && action.feedback?.trim()) {
    await runTask(p.id, p.setup_stage as SetupTask, action.feedback.trim());
  }
  return { ok: true };
}

/** n8n failed: free the agent and tell the creator. */
export async function setupFail(input: { projectId: string; error?: string }) {
  const db = admin();
  const { data } = await db.from("projects").select("owner_id, status").eq("id", input.projectId).maybeSingle();
  if (!data || data.status !== "setup") return { ok: true };
  await db.from("projects").update({ setup_busy: false }).eq("id", input.projectId);
  await postAssistantMessage(db, data.owner_id as string, input.projectId, "⚠️ I couldn't finish that step. Tap Retry, or tell me again.");
  return { ok: true };
}
