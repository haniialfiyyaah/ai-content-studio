import "server-only";
import { AppError, ErrorCodes, notFound, resolveContent, type Scene } from "@acs/domain";
import {
  FAL_COMPOSE_MODEL,
  composeInput,
  extractVideoUrl,
  falPoll,
  falSubmit,
  falVideoModel,
  sceneVideoInput,
  scenePrompt,
  synthesizeNarration,
} from "@acs/integrations";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity, notifyTelegram } from "./events";
import type { ContentRow, ProjectRow, RenderRow, RenderStep } from "./rows";

const admin = () => createAdminClient();
const BUCKET = "renders";

async function loadRender(renderId: string) {
  const { data } = await admin().from("video_renders").select("*").eq("id", renderId).maybeSingle();
  if (!data) throw notFound("Render");
  return data as RenderRow;
}

/**
 * Claim (queued → rendering, compare-and-set) and submit one fal clip per
 * scene. Optional ElevenLabs narration is stored for the compose step.
 * A lost race returns { claimed:false } — the caller simply stops.
 */
export async function startRender(renderId: string) {
  const db = admin();
  const { data: claimed } = await db
    .from("video_renders")
    .update({ status: "rendering", phase: "scenes", started_at: new Date().toISOString(), error: null })
    .eq("id", renderId)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();
  if (!claimed) return { claimed: false, status: (await loadRender(renderId)).status };
  const render = claimed as RenderRow;

  try {
    const [{ data: content }, { data: project }] = await Promise.all([
      db.from("contents").select("*").eq("id", render.content_id).single(),
      db.from("projects").select("*").eq("id", render.project_id).single(),
    ]);
    const c = content as ContentRow;
    const p = project as ProjectRow;
    const scenes: Scene[] = (c.scenes ?? []).slice(0, 6);
    const model = falVideoModel();
    const fallback = c.video_prompt || resolveContent(c.options, c.selection).title;
    const prompts = (scenes.length ? scenes : [{ heading: fallback } as Scene]).map((s) =>
      scenePrompt({ visualStyle: p.creative_kit?.visualStyle, visual: s.visual, motion: s.motion, heading: s.heading, fallback }),
    );

    const steps: RenderStep[] = [];
    for (const [i, prompt] of prompts.entries()) {
      steps.push({ scene: i, requestId: await falSubmit(model, sceneVideoInput(prompt)), status: "queued", url: null });
    }

    let narrationPath: string | null = null;
    const audio = await synthesizeNarration(resolveContent(c.options, c.selection).script);
    if (audio) {
      narrationPath = `${render.owner_id}/${render.id}/narration.mp3`;
      await db.storage.from(BUCKET).upload(narrationPath, audio, { contentType: "audio/mpeg", upsert: true });
    }

    await db
      .from("video_renders")
      .update({
        steps,
        model,
        provider: "fal",
        narration_path: narrationPath,
        prompt: prompts.join("\n---\n"),
        attempts: render.attempts + 1,
      })
      .eq("id", render.id);
    return { claimed: true, status: "rendering", scenes: steps.length };
  } catch (error) {
    await failRender(render.id, error instanceof Error ? error.message : "Render failed to start");
    throw error;
  }
}

/** Advance the render state machine one step. Returns the current status. */
export async function pollRender(renderId: string) {
  const db = admin();
  const render = await loadRender(renderId);
  if (render.status !== "rendering") return { status: render.status, phase: render.phase };

  if (render.phase === "scenes") {
    const steps = await Promise.all(
      render.steps.map(async (s) => {
        if (s.status === "completed" || s.status === "failed") return s;
        const { status, result } = await falPoll(render.model ?? falVideoModel(), s.requestId);
        return { ...s, status, url: status === "completed" ? extractVideoUrl(result) : null };
      }),
    );
    if (steps.some((s) => s.status === "failed" || (s.status === "completed" && !s.url))) {
      await db.from("video_renders").update({ steps }).eq("id", render.id);
      await failRender(render.id, "A scene clip failed to generate");
      return { status: "failed", phase: "scenes" };
    }
    if (!steps.every((s) => s.status === "completed")) {
      await db.from("video_renders").update({ steps }).eq("id", render.id);
      return { status: "rendering", phase: "scenes", done: steps.filter((s) => s.status === "completed").length, total: steps.length };
    }

    let narrationUrl: string | null = null;
    if (render.narration_path) {
      const { data } = await db.storage.from(BUCKET).createSignedUrl(render.narration_path, 3600);
      narrationUrl = data?.signedUrl ?? null;
    }
    const clips = steps.map((s) => s.url!) as string[];
    const composeId = await falSubmit(FAL_COMPOSE_MODEL, composeInput(clips, narrationUrl));
    await db.from("video_renders").update({ steps, phase: "compose", compose_request_id: composeId }).eq("id", render.id);
    return { status: "rendering", phase: "compose" };
  }

  // compose phase
  const { status, result } = await falPoll(FAL_COMPOSE_MODEL, render.compose_request_id!);
  if (status === "failed") {
    await failRender(render.id, "Video composition failed");
    return { status: "failed", phase: "compose" };
  }
  if (status !== "completed") return { status: "rendering", phase: "compose" };
  const url = extractVideoUrl(result);
  if (!url) {
    await failRender(render.id, "Composer returned no video");
    return { status: "failed", phase: "compose" };
  }
  await finishRender(render, url);
  return { status: "ready", phase: "done" };
}

async function finishRender(render: RenderRow, url: string) {
  const db = admin();
  const res = await fetch(url);
  if (!res.ok) throw new AppError(ErrorCodes.PROVIDER_ERROR, `Download failed (${res.status})`, 502);
  const bytes = await res.arrayBuffer();
  const path = `${render.owner_id}/${render.id}/video.mp4`;
  const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: "video/mp4", upsert: true });
  if (error) throw new AppError(ErrorCodes.INTERNAL_ERROR, `Storage upload failed: ${error.message}`, 500);

  await db
    .from("video_renders")
    .update({
      status: "ready",
      phase: "done",
      storage_path: path,
      duration_seconds: render.steps.length * 5,
      finished_at: new Date().toISOString(),
    })
    .eq("id", render.id);
  await db.from("publish_jobs").update({ render_id: render.id }).eq("content_id", render.content_id).eq("status", "scheduled");

  const { data: content } = await db.from("contents").select("options, selection").eq("id", render.content_id).single();
  const title = resolveContent(content?.options, content?.selection).title;
  await logActivity(db, { ownerId: render.owner_id, projectId: render.project_id, kind: "render.ready", message: `Video ready: ${title}` });
  await notifyTelegram(db, {
    ownerId: render.owner_id,
    projectId: render.project_id,
    template: "render.ready",
    text: `🎬 Video ready: "${title}". It will be uploaded at its scheduled time.`,
    path: `/videos?render=${render.id}`,
  });
}

export async function failRender(renderId: string, message: string) {
  const db = admin();
  const { data } = await db
    .from("video_renders")
    .update({ status: "failed", error: message.slice(0, 500), finished_at: new Date().toISOString() })
    .eq("id", renderId)
    .in("status", ["queued", "rendering"])
    .select("owner_id, project_id")
    .maybeSingle();
  if (data) {
    await logActivity(db, { ownerId: data.owner_id, projectId: data.project_id, kind: "render.failed", message: `Render failed: ${message}` });
    await notifyTelegram(db, {
      ownerId: data.owner_id,
      projectId: data.project_id,
      template: "render.failed",
      text: `⚠️ A video render failed (${message}). You can retry it from Videos.`,
      path: "/videos",
    });
  }
  return { ok: true };
}

export async function signedVideoUrl(path: string | null, seconds = 3600): Promise<string | null> {
  if (!path) return null;
  const { data } = await admin().storage.from(BUCKET).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}
