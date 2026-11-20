import "server-only";
import { AppError, ErrorCodes, notFound, resolveContent, type Scene } from "@acs/domain";
import {
  FAL_IMAGE_FALLBACK_MODEL,
  evenCaptions,
  extractImageUrl,
  falImageModel,
  falPoll,
  falReferenceModel,
  falSubmit,
  editOpenAiImage,
  generateOpenAiImage,
  openAiImagesConfigured,
  referenceImageInput,
  sceneImagePrompt,
  synthesizeNarration,
  textToImageInput,
  type CaptionWord,
} from "@acs/integrations";
import { createAdminClient } from "@/lib/supabase/admin";
import { listAssets } from "./assets";
import { logActivity, notifyTelegram } from "./events";
import type { ContentRow, ProjectRow, RenderRow } from "./rows";
import { appUrl } from "./session";

const admin = () => createAdminClient();
const BUCKET = "renders";
const ACCENTS = ["#e8735a", "#7056d9", "#3b3550", "#2a886b"];

/**
 * Scene step: `source` says where the image comes from.
 *  - openai: generated synchronously by OpenAI images, stored at `imagePath` (primary)
 *  - fal: queued fal job (`requestId` on `model`), may fall back once (secondary)
 *  - reference: the user's upload is the scene image (no generation)
 *  - none: gradient fallback rendered by Remotion
 */
export interface SceneStep {
  scene: number;
  source: "openai" | "reference" | "fal" | "none";
  model?: string;
  requestId?: string;
  referencePath?: string;
  imagePath?: string;
  status: "queued" | "in_progress" | "completed" | "failed";
  url: string | null;
  retried?: boolean;
}

type LoadedRender = Omit<RenderRow, "steps"> & { steps: SceneStep[]; captions: CaptionWord[] };

async function loadRender(renderId: string) {
  const { data } = await admin().from("video_renders").select("*").eq("id", renderId).maybeSingle();
  if (!data) throw notFound("Render");
  return data as LoadedRender;
}

export function rendererConfigured() {
  return Boolean(process.env.RENDERER_URL?.trim() && process.env.RENDERER_TOKEN?.trim());
}

/** RENDERER_URL with scheme (accepts "host.up.railway.app" or a full URL). */
function rendererBase(): string {
  const raw = (process.env.RENDERER_URL ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

/**
 * Claim (queued → rendering, CAS) then prepare assets: one image per scene
 * (reference upload, fal generation, or reference-guided generation) and the
 * narration + word timings. A lost race returns { claimed:false }.
 */
export async function startRender(renderId: string) {
  const db = admin();
  const { data: claimed } = await db
    .from("video_renders")
    .update({ status: "rendering", phase: "assets", started_at: new Date().toISOString(), error: null })
    .eq("id", renderId)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();
  if (!claimed) return { claimed: false, status: (await loadRender(renderId)).status };
  const render = claimed as unknown as LoadedRender;

  try {
    if (!rendererConfigured()) {
      throw new AppError(ErrorCodes.NOT_CONFIGURED, "Video renderer is not configured (RENDERER_URL / RENDERER_TOKEN)", 503);
    }
    const [{ data: content }, { data: project }] = await Promise.all([
      db.from("contents").select("*").eq("id", render.content_id).single(),
      db.from("projects").select("*").eq("id", render.project_id).single(),
    ]);
    const c = content as ContentRow;
    const p = project as ProjectRow & { visual_mode: "ai" | "ai_with_references" | "references" };
    const picked = resolveContent(c.options, c.selection);
    const scenes: Scene[] = (c.scenes?.length ? c.scenes : [{ heading: picked.title } as Scene]).slice(0, 6);
    // Provider chain per scene: OpenAI images → fal → user's reference → gradient.
    const refs = await listAssets(p.id, 6 * 3600);
    const refFor = (s: Scene, i: number) =>
      refs.length ? refs[s.referenceIndex >= 0 && s.referenceIndex < refs.length ? s.referenceIndex : i % refs.length] : null;
    const generate = p.visual_mode !== "references";
    let openAiAvailable = generate && openAiImagesConfigured();
    let falAvailable = generate && Boolean(process.env.FAL_KEY?.trim());

    // Reference bytes for OpenAI edits (only in "AI + my references").
    const refBytes = new Map<string, { bytes: ArrayBuffer; mimeType: string; name: string }>();
    if (openAiAvailable && p.visual_mode === "ai_with_references") {
      for (const r of refs.slice(0, 8)) {
        const { data } = await db.storage.from("assets").download(r.storage_path);
        if (data) refBytes.set(r.id, { bytes: await data.arrayBuffer(), mimeType: data.type || "image/png", name: r.storage_path.split("/").pop()! });
      }
    }

    const prompts = scenes.map((s) =>
      sceneImagePrompt({ visual: s.visual, heading: s.heading, visualStyle: p.creative_kit?.visualStyle, fallback: c.video_prompt || picked.title }),
    );

    // 1) OpenAI, all scenes in parallel (synchronous API → stored immediately)
    const openAiResults = openAiAvailable
      ? await Promise.all(
          scenes.map(async (s, i): Promise<SceneStep | null> => {
            const ref = refFor(s, i);
            const guided = p.visual_mode === "ai_with_references" && ref ? refBytes.get(ref.id) : undefined;
            try {
              const img = guided ? await editOpenAiImage(prompts[i], [guided]) : await generateOpenAiImage(prompts[i]);
              const imagePath = `${render.owner_id}/${render.id}/scene-${i}.png`;
              await db.storage.from(BUCKET).upload(imagePath, img.bytes, { contentType: "image/png", upsert: true });
              return { scene: i, source: "openai", model: img.model, imagePath, status: "completed", url: null };
            } catch (e) {
              console.warn(`[render] OpenAI image failed for scene ${i}:`, e instanceof Error ? e.message : e);
              if (e instanceof AppError && e.code === ErrorCodes.NOT_CONFIGURED) openAiAvailable = false;
              return null;
            }
          }),
        )
      : scenes.map(() => null);

    const steps: SceneStep[] = [];
    for (const [i, s] of scenes.entries()) {
      if (openAiResults[i]) {
        steps.push(openAiResults[i]!);
        continue;
      }
      const ref = refFor(s, i);
      const asReference = (): SceneStep =>
        ref
          ? { scene: i, source: "reference", referencePath: ref.storage_path, status: "completed", url: ref.url }
          : { scene: i, source: "none", status: "completed", url: null };

      // 2) fal (async queue; polled in pollRender)
      if (falAvailable) {
        const guided = p.visual_mode === "ai_with_references" && ref?.url;
        const model = guided ? falReferenceModel() : falImageModel();
        const input = guided ? referenceImageInput(prompts[i], ref!.url!) : textToImageInput(prompts[i]);
        try {
          steps.push({ scene: i, source: "fal", model, requestId: await falSubmit(model, input), status: "queued", url: null });
          continue;
        } catch (e) {
          console.warn(`[render] fal failed for scene ${i}:`, e instanceof Error ? e.message : e);
          if (e instanceof AppError && e.code === ErrorCodes.NOT_CONFIGURED) falAvailable = false;
        }
      }
      // 3) reference or gradient
      steps.push(asReference());
    }

    // Narration with word timings; captions fall back to even timing.
    let narrationPath: string | null = null;
    let captions: CaptionWord[] = evenCaptions(picked.script);
    try {
      const voice = await synthesizeNarration(picked.script);
      if (voice) {
        narrationPath = `${render.owner_id}/${render.id}/narration.mp3`;
        await db.storage.from(BUCKET).upload(narrationPath, voice.audio, { contentType: "audio/mpeg", upsert: true });
        if (voice.words.length) captions = voice.words;
      }
    } catch (e) {
      console.warn("[render] narration skipped", e);
    }

    await db
      .from("video_renders")
      .update({
        steps,
        captions,
        narration_path: narrationPath,
        provider: [...new Set(steps.map((st) => st.source))].join("+") + "+remotion",
        model: [...new Set(steps.map((s) => s.model ?? s.source))].join(", "),
        prompt: c.video_prompt,
        attempts: render.attempts + 1,
      })
      .eq("id", render.id);
    return { claimed: true, status: "rendering", scenes: steps.length };
  } catch (error) {
    await failRender(render.id, error instanceof Error ? error.message : "Render failed to start");
    return { claimed: true, status: "failed" };
  }
}

/** Advance one step: poll scene images; when all are settled hand off to the renderer. */
export async function pollRender(renderId: string) {
  const db = admin();
  const render = await loadRender(renderId);
  if (render.status !== "rendering") return { status: render.status, phase: render.phase };
  if (render.phase === "compose") return { status: "rendering", phase: "compose" };

  const steps = await Promise.all(
    render.steps.map(async (s): Promise<SceneStep> => {
      if (s.source !== "fal" || s.status === "completed" || s.status === "failed") return s;
      try {
        const { status, result } = await falPoll(s.model!, s.requestId!);
        if (status === "completed") {
          const url = extractImageUrl(result);
          return { ...s, status: url ? "completed" : "failed", url };
        }
        if (status === "failed" && !s.retried) {
          // one fallback attempt on the cheap text-to-image model
          const prompt = (render.prompt || "stylized illustration").slice(0, 1500);
          return {
            ...s,
            retried: true,
            model: FAL_IMAGE_FALLBACK_MODEL,
            requestId: await falSubmit(FAL_IMAGE_FALLBACK_MODEL, textToImageInput(prompt)),
            status: "queued",
          };
        }
        return { ...s, status };
      } catch {
        return s; // transient: try again next pass
      }
    }),
  );
  // Scenes that still failed fall back to a branded gradient (never blocks the video).
  const settled = steps.map((s) => (s.status === "failed" ? { ...s, source: "none" as const, url: null } : s));
  const pending = settled.some((s) => s.source === "fal" && s.status !== "completed");
  await db.from("video_renders").update({ steps: settled }).eq("id", render.id);
  if (pending) {
    return { status: "rendering", phase: "assets", done: settled.filter((s) => s.status === "completed").length, total: settled.length };
  }

  try {
    await dispatchToRenderer({ ...render, steps: settled });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[render] dispatch to renderer failed", message);
    await failRender(render.id, `Could not reach the video renderer: ${message}`.slice(0, 300));
    return { status: "failed", phase: "assets" };
  }
  return { status: "rendering", phase: "compose" };
}

async function dispatchToRenderer(render: LoadedRender) {
  const db = admin();
  const [{ data: content }, { data: project }] = await Promise.all([
    db.from("contents").select("*").eq("id", render.content_id).single(),
    db.from("projects").select("cover_tone").eq("id", render.project_id).single(),
  ]);
  const c = content as ContentRow;
  const picked = resolveContent(c.options, c.selection);
  const scenes = (c.scenes?.length ? c.scenes : [{ heading: picked.title, seconds: 5 } as Scene]).slice(0, render.steps.length);

  // Scene durations follow the narration length, split by each scene's share of words.
  const voiceEnd = render.captions.length ? render.captions[render.captions.length - 1].end + 0.6 : 0;
  const base = scenes.map((s) => s.seconds || 5);
  const weights = scenes.map((s) => Math.max(1, (s.narration || "").split(/\s+/).filter(Boolean).length));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const durations = voiceEnd
    ? weights.map((w) => Math.max(2, (voiceEnd * w) / totalWeight))
    : base;

  const signedRef = async (path?: string) =>
    path ? (await db.storage.from("assets").createSignedUrl(path, 6 * 3600)).data?.signedUrl ?? null : null;
  const sceneProps = await Promise.all(
    scenes.map(async (s, i) => {
      const step = render.steps[i];
      const imageUrl =
        step?.source === "reference"
          ? await signedRef(step.referencePath)
          : step?.source === "openai" && step.imagePath
            ? (await db.storage.from(BUCKET).createSignedUrl(step.imagePath, 6 * 3600)).data?.signedUrl ?? null
            : step?.url ?? null;
      return { imageUrl, seconds: Number(durations[i].toFixed(2)), onScreenText: s.onScreenText || "", motion: s.motion || "" };
    }),
  );
  const narrationUrl = render.narration_path
    ? (await db.storage.from(BUCKET).createSignedUrl(render.narration_path, 6 * 3600)).data?.signedUrl ?? null
    : null;

  const path = `${render.owner_id}/${render.id}/video.mp4`;
  const { data: upload, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
  if (error || !upload) throw new AppError(ErrorCodes.INTERNAL_ERROR, "Could not prepare video upload", 500);

  const res = await fetch(`${rendererBase()}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RENDERER_TOKEN}` },
    body: JSON.stringify({
      renderId: render.id,
      uploadUrl: upload.signedUrl,
      callbackUrl: `${appUrl()}/api/internal/renders/callback`,
      props: {
        title: picked.title,
        hook: picked.hook,
        accent: ACCENTS[(project?.cover_tone ?? 1) % ACCENTS.length],
        scenes: sceneProps,
        narrationUrl,
        words: render.captions,
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    await failRender(render.id, `Renderer rejected the job (${res.status})`);
    return;
  }
  await db.from("video_renders").update({ phase: "compose", storage_path: path }).eq("id", render.id);
}

/** Renderer callback: the MP4 is already uploaded to `storage_path`. */
export async function rendererCallback(input: { renderId: string; ok: boolean; error?: string; durationSeconds?: number }) {
  const render = await loadRender(input.renderId);
  if (render.status !== "rendering") return { ok: true, ignored: render.status };
  if (!input.ok) return failRender(render.id, input.error || "Renderer failed");

  const db = admin();
  await db
    .from("video_renders")
    .update({
      status: "ready",
      phase: "done",
      duration_seconds: input.durationSeconds ?? null,
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
    text: `🎬 Video ready: "${title}"`,
    path: `/projects/${render.project_id}?tab=videos`,
    renderId: render.id,
  });
  return { ok: true };
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
      text: `⚠️ A video render failed (${message}). Its upload is on hold — retry it from Videos.`,
      path: "/videos",
    });
  }
  return { ok: true };
}

export async function signedVideoUrl(path: string | null, seconds = 3600, download?: string): Promise<string | null> {
  if (!path) return null;
  const { data } = await admin().storage.from(BUCKET).createSignedUrl(path, seconds, download ? { download } : undefined);
  return data?.signedUrl ?? null;
}

/** Owner-checked download link (Content-Disposition: attachment). */
export async function downloadUrl(ownerId: string, renderId: string) {
  const { data } = await admin()
    .from("video_renders")
    .select("storage_path, status, contents(options, selection)")
    .eq("id", renderId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!data || data.status !== "ready") throw notFound("Video");
  const c = data.contents as unknown as Pick<ContentRow, "options" | "selection"> | null;
  const name = resolveContent(c?.options, c?.selection).title.replace(/[^\w\- ]+/g, "").trim().slice(0, 60) || "video";
  return signedVideoUrl(data.storage_path, 600, `${name}.mp4`);
}
