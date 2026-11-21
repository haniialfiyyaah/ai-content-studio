import "server-only";
import { createHash } from "node:crypto";
import { after } from "next/server";
import { AppError, ErrorCodes, notFound, resolveContent, type Scene, projectKit } from "@acs/domain";
import {
  editOpenAiImage,
  extractImageUrl,
  falImageModel,
  falPoll,
  falReferenceModel,
  falSubmit,
  generateOpenAiImage,
  openAiImagesConfigured,
  referenceImageInput,
  sceneImagePrompt,
  textToImageInput,
} from "@acs/integrations";
import { createAdminClient } from "@/lib/supabase/admin";
import { listAssets } from "./assets";
import { IDENTITY_LABEL, generateIdentityReference } from "./identity";
import type { ContentRow, ProjectRow } from "./rows";
import { appUrl } from "./session";

const admin = () => createAdminClient();
const BUCKET = "renders";
/** Max beats a Short can have (render + storyboard). */
export const MAX_BEATS = 12;
/** A storyboard run older than this is considered dead and may be restarted. */
const STALE_MS = 10 * 60_000;

/**
 * One drawn scene. `imagePath` is in the renders bucket; `source` is "openai"
 * for any stored image (OpenAI or fal — `model` says which), "reference" for
 * the user's upload, "none" for design beats (drawn by the template).
 */
export interface StoryboardFrame {
  scene: number;
  source: "openai" | "reference" | "none";
  model?: string;
  imagePath?: string;
  referencePath?: string;
  /** The shot text this image was drawn from (unchanged shot → the image is reused). */
  visual?: string;
  /** drawing = image being made · editing = the scene text is being rewritten first */
  status: "completed" | "failed" | "drawing" | "editing";
  url: string | null;
}

type Project = ProjectRow & { visual_mode: "ai" | "ai_with_references" | "references"; image_engine?: "openai" | "fal" };

/** Changes whenever what would be drawn changes (scenes, style, mode, engine). */
export function storyboardKey(c: Pick<ContentRow, "scenes">, p: Project) {
  const scenes = (c.scenes ?? []).slice(0, MAX_BEATS).map((s) => [s.visual, s.heading, s.layout, s.background, s.referenceIndex]);
  return createHash("sha1")
    .update(JSON.stringify([scenes, projectKit(p).visualStyle, projectKit(p).palette, p.visual_mode, p.image_engine ?? "openai"]))
    .digest("hex")
    .slice(0, 16);
}

/** Queue storyboard drawing for these contents (one serverless run each, after the response). */
export function queueStoryboards(contentIds: string[]) {
  const ids = [...new Set(contentIds)].filter(Boolean);
  if (!ids.length || (!openAiImagesConfigured() && !process.env.FAL_KEY?.trim())) return;
  after(() =>
    Promise.all(
      ids.map((contentId) =>
        fetch(`${appUrl()}/api/internal/storyboard/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-acs-service-token": process.env.ACS_INTERNAL_SERVICE_TOKEN ?? "" },
          body: JSON.stringify({ contentId }),
          signal: AbortSignal.timeout(295_000),
        }).catch(() => undefined),
      ),
    ).then(() => undefined),
  );
}

async function storeImage(ownerId: string, contentId: string, i: number, bytes: Uint8Array | ArrayBuffer) {
  const imagePath = `${ownerId}/storyboard/${contentId}/scene-${i}-${Date.now().toString(36)}.png`;
  const { error } = await admin().storage.from(BUCKET).upload(imagePath, bytes, { contentType: "image/png", upsert: true });
  if (error) throw new AppError(ErrorCodes.INTERNAL_ERROR, `Could not store scene image: ${error.message}`, 500);
  return imagePath;
}

async function falImage(prompt: string, refUrl: string | null): Promise<{ bytes: ArrayBuffer; model: string }> {
  const model = refUrl ? falReferenceModel() : falImageModel();
  const requestId = await falSubmit(model, refUrl ? referenceImageInput(prompt, refUrl) : textToImageInput(prompt));
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const { status, result } = await falPoll(model, requestId);
    if (status === "completed") {
      const url = extractImageUrl(result);
      if (!url) break;
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) break;
      return { bytes: await res.arrayBuffer(), model };
    }
    if (status === "failed") break;
  }
  throw new AppError(ErrorCodes.PROVIDER_ERROR, "fal image failed or timed out", 502);
}

/** Runs `fn` over items with at most `limit` in flight (image APIs rate-limit). */
async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

/**
 * Draws every image beat of one content with the project's engine (the other
 * engine is the backup), stores the frames and marks the storyboard ready.
 * Idempotent: a matching ready storyboard or a live run is left alone.
 */
export async function generateStoryboard(contentId: string, opts: { force?: boolean } = {}) {
  const db = admin();
  const { data: content } = await db.from("contents").select("*").eq("id", contentId).maybeSingle();
  if (!content) throw notFound("Content");
  const c = content as ContentRow & { storyboard_status: string; storyboard_key: string | null; storyboard_started_at: string | null };
  const { data: project } = await db.from("projects").select("*").eq("id", c.project_id).single();
  const p = project as Project;
  const key = storyboardKey(c, p);

  if (!opts.force && c.storyboard_status === "ready" && c.storyboard_key === key) return { status: "ready", skipped: true };
  const live = c.storyboard_status === "generating" && c.storyboard_started_at && Date.now() - new Date(c.storyboard_started_at).getTime() < STALE_MS;
  if (live) return { status: "generating", skipped: true };

  await db.from("contents").update({ storyboard_status: "generating", storyboard_started_at: new Date().toISOString() }).eq("id", c.id);

  try {
    const picked = resolveContent(c.options, c.selection);
    const scenes: Scene[] = (c.scenes?.length ? c.scenes : [{ heading: picked.title } as Scene]).slice(0, MAX_BEATS);

    // The recurring character keeps scenes consistent; draw it once if missing.
    if (p.visual_mode !== "references" && projectKit(p).recurringSubject?.trim() && openAiImagesConfigured()) {
      const { count } = await db.from("project_assets").select("id", { count: "exact", head: true }).eq("project_id", p.id).eq("label", IDENTITY_LABEL);
      if (!count) {
        await generateIdentityReference(p.id).catch(() => undefined);
        if (p.visual_mode === "ai") {
          await db.from("projects").update({ visual_mode: "ai_with_references" }).eq("id", p.id);
          p.visual_mode = "ai_with_references";
        }
      }
    }

    const refs = await listAssets(p.id, 6 * 3600);
    const refFor = (s: Scene, i: number) =>
      refs.length ? refs[s.referenceIndex >= 0 && s.referenceIndex < refs.length ? s.referenceIndex : i % refs.length] : null;
    const guidedMode = p.visual_mode === "ai_with_references";
    const refBytes = new Map<string, { bytes: ArrayBuffer; mimeType: string; name: string }>();
    if (guidedMode) {
      for (const r of refs.slice(0, 8)) {
        const { data } = await db.storage.from("assets").download(r.storage_path);
        if (data) refBytes.set(r.id, { bytes: await data.arrayBuffer(), mimeType: data.type || "image/png", name: r.storage_path.split("/").pop()! });
      }
    }

    const openAiOk = openAiImagesConfigured();
    const falOk = Boolean(process.env.FAL_KEY?.trim());
    const engines = (p.image_engine === "fal" ? ["fal", "openai"] : ["openai", "fal"]).filter((e) => (e === "fal" ? falOk : openAiOk));

    // Images carry no text: a scene whose shot didn't change keeps its image (unless forced).
    const previous = ((c as ContentRow & { storyboard?: StoryboardFrame[] | null }).storyboard ?? []) as StoryboardFrame[];
    const keep = (s: Scene, i: number) => {
      const f = previous.find((x) => x.scene === i);
      return !opts.force && f?.imagePath && f.status === "completed" && (f.visual ?? "") === (s.visual ?? "") ? f : null;
    };
    // Placeholders first, then each image is saved as soon as it lands (the UI fills in live).
    const live: StoryboardFrame[] = scenes.map((s, i) => {
      const kept = keep(s, i);
      if (kept) return kept;
      return { scene: i, source: "none", status: p.visual_mode === "references" || s.background === "design" ? "completed" : "drawing", url: null };
    });
    let writes = Promise.resolve();
    const save = () => {
      const snapshot = live.map((f) => ({ ...f }));
      writes = writes.then(async () => {
        await db.from("contents").update({ storyboard: snapshot }).eq("id", c.id);
      });
      return writes;
    };
    await save();

    const frames = await pool(scenes, 3, async (s, i): Promise<StoryboardFrame> => {
      const kept = keep(s, i);
      if (kept) return kept;
      // Archived (or stopped) meanwhile: stop drawing.
      const { data: st } = await db.from("projects").select("status").eq("id", p.id).maybeSingle();
      if (st?.status === "archived" || st?.status === "stopped") return { ...live[i], status: "failed" };
      const f = { ...(await drawFrame(s, i)), visual: s.visual };
      live[i] = f;
      await save();
      return f;
    });
    async function drawFrame(s: Scene, i: number): Promise<StoryboardFrame> {
      const ref = refFor(s, i);
      if (p.visual_mode === "references" || s.background === "design") {
        if (p.visual_mode === "references" && ref) {
          return { scene: i, source: "reference", referencePath: ref.storage_path, status: "completed", url: null };
        }
        return { scene: i, source: "none", status: "completed", url: null };
      }
      const prompt = sceneImagePrompt({
        visual: s.visual,
        heading: s.heading,
        layout: s.layout,
        visualStyle: projectKit(p).visualStyle,
        palette: projectKit(p).palette,
        recurringSubject: projectKit(p).recurringSubject,
        fallback: c.video_prompt || picked.title,
      });
      for (const engine of engines) {
        try {
          if (engine === "openai") {
            const guided = guidedMode && ref ? refBytes.get(ref.id) : undefined;
            const img = guided ? await editOpenAiImage(prompt, [guided]) : await generateOpenAiImage(prompt);
            return { scene: i, source: "openai", model: img.model, imagePath: await storeImage(c.owner_id, c.id, i, img.bytes), status: "completed", url: null };
          }
          const img = await falImage(prompt, guidedMode ? ref?.url ?? null : null);
          return { scene: i, source: "openai", model: img.model, imagePath: await storeImage(c.owner_id, c.id, i, img.bytes), status: "completed", url: null };
        } catch (e) {
          console.warn(`[storyboard] ${engine} failed for scene ${i}:`, e instanceof Error ? e.message : e);
        }
      }
      // Nothing could draw it: the user's reference, else the template gradient.
      return ref
        ? { scene: i, source: "reference", referencePath: ref.storage_path, status: "completed", url: null }
        : { scene: i, source: "none", status: "failed", url: null };
    }
    await writes;

    const drawn = frames.filter((f) => f.source === "openai").length;
    const wanted = scenes.filter((s) => p.visual_mode !== "references" && s.background !== "design").length;
    const status = wanted && !drawn ? "failed" : "ready";
    await db.from("contents").update({ storyboard: frames, storyboard_status: status, storyboard_key: key }).eq("id", c.id);
    // "Auto-create videos" on: the last finished storyboard starts the videos.
    if (p.auto_video) await import("./setup").then((m) => m.autoVideos(p.id)).catch(() => undefined);
    return { status, drawn, total: frames.length };
  } catch (e) {
    await db.from("contents").update({ storyboard_status: "failed" }).eq("id", c.id);
    throw e;
  }
}

/** Ready storyboard frames for this content, or null if missing/out of date. */
export async function usableStoryboard(c: ContentRow & { storyboard?: StoryboardFrame[] | null; storyboard_status?: string; storyboard_key?: string | null }, p: Project) {
  if (c.storyboard_status !== "ready" || !c.storyboard?.length) return null;
  if (c.storyboard_key !== storyboardKey(c, p)) return null;
  return c.storyboard;
}

/** Signed image URLs per scene for display (null where the template draws it). */
export async function storyboardImageUrls(frames: StoryboardFrame[] | null | undefined, seconds = 3600): Promise<(string | null)[]> {
  if (!frames?.length) return [];
  const db = admin();
  const renderPaths = frames.filter((f) => f.imagePath).map((f) => f.imagePath!);
  const refPaths = frames.filter((f) => f.referencePath).map((f) => f.referencePath!);
  const [r, a] = await Promise.all([
    renderPaths.length ? db.storage.from(BUCKET).createSignedUrls(renderPaths, seconds) : Promise.resolve({ data: [] }),
    refPaths.length ? db.storage.from("assets").createSignedUrls(refPaths, seconds) : Promise.resolve({ data: [] }),
  ]);
  const signed = new Map<string, string>();
  for (const d of [...(r.data ?? []), ...(a.data ?? [])]) if (d.path && d.signedUrl) signed.set(d.path, d.signedUrl);
  const out: (string | null)[] = [];
  for (const f of frames) out[f.scene] = signed.get(f.imagePath ?? f.referencePath ?? "") ?? null;
  return out;
}

/** User action: draw (or redraw) this content's storyboard images now. */
export async function redrawStoryboard(ownerId: string, contentId: string) {
  const db = admin();
  const { data } = await db.from("contents").select("id").eq("id", contentId).eq("owner_id", ownerId).maybeSingle();
  if (!data) throw notFound("Content");
  await db.from("contents").update({ storyboard_status: "generating", storyboard_started_at: null }).eq("id", contentId);
  after(() => generateStoryboard(contentId, { force: true }).then(() => undefined).catch(() => undefined));
  return { generating: true };
}

/** Ask the app (in its own serverless run) to redraw one scene of a storyboard. */
export function queueSceneRedraw(contentId: string, scene: number) {
  after(() =>
    fetch(`${appUrl()}/api/internal/storyboard/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-acs-service-token": process.env.ACS_INTERNAL_SERVICE_TOKEN ?? "" },
      body: JSON.stringify({ contentId, scene }),
      signal: AbortSignal.timeout(295_000),
    }).then(() => undefined).catch(() => undefined),
  );
}

/** Mark one storyboard frame (e.g. "editing" while its text is rewritten). */
export async function markFrame(contentId: string, scene: number, status: StoryboardFrame["status"]) {
  const db = admin();
  const { data } = await db.from("contents").select("storyboard").eq("id", contentId).maybeSingle();
  const frames = ((data?.storyboard ?? []) as StoryboardFrame[]).map((f) => ({ ...f }));
  if (!frames[scene]) frames[scene] = { scene, source: "none", status, url: null };
  else frames[scene].status = status;
  await db.from("contents").update({ storyboard: frames }).eq("id", contentId);
}

/**
 * Redraw ONE scene (docs/FLOW.md redraw rules): the prompt is locked to the
 * scene text, same style / palette / character / engine, and the neighbouring
 * scenes' images are references so the look stays the same.
 */
export async function redrawScene(contentId: string, index: number) {
  const db = admin();
  const { data: content } = await db.from("contents").select("*").eq("id", contentId).maybeSingle();
  if (!content) throw notFound("Content");
  const c = content as ContentRow & { storyboard?: StoryboardFrame[] | null };
  const { data: project } = await db.from("projects").select("*").eq("id", c.project_id).single();
  const p = project as Project;
  const s = (c.scenes ?? [])[index];
  if (!s) throw notFound("Scene");
  const frames = ((c.storyboard ?? []) as StoryboardFrame[]).map((f) => ({ ...f }));
  const setFrame = async (f: StoryboardFrame) => {
    const { data: fresh } = await db.from("contents").select("storyboard").eq("id", contentId).maybeSingle();
    const cur = ((fresh?.storyboard ?? frames) as StoryboardFrame[]).map((x) => ({ ...x }));
    cur[index] = f;
    await db.from("contents").update({ storyboard: cur, storyboard_key: storyboardKey({ scenes: c.scenes }, p) }).eq("id", contentId);
  };
  if (s.background === "design" || p.visual_mode === "references") {
    await setFrame({ scene: index, source: "none", status: "completed", url: null });
    return { scene: index, drawn: false };
  }
  await setFrame({ ...(frames[index] ?? { scene: index, source: "none", url: null }), status: "drawing" });

  const kit = projectKit(p);
  const prompt =
    sceneImagePrompt({ visual: s.visual, heading: s.heading, layout: s.layout, visualStyle: kit.visualStyle, palette: kit.palette, recurringSubject: kit.recurringSubject, fallback: c.video_prompt || s.heading }) +
    " Match the reference frames exactly in art style, line work, lighting, colours and character design — only the scene content changes.";

  // References: the neighbours' images + the project character.
  const refs: { bytes: ArrayBuffer; mimeType: string; name: string }[] = [];
  for (const j of [index - 1, index + 1]) {
    const path = frames[j]?.imagePath;
    if (!path) continue;
    const { data } = await db.storage.from(BUCKET).download(path);
    if (data) refs.push({ bytes: await data.arrayBuffer(), mimeType: data.type || "image/png", name: `scene-${j}.png` });
  }
  const identity = (await listAssets(p.id, 600)).find((a) => a.label === IDENTITY_LABEL);
  if (identity) {
    const { data } = await db.storage.from("assets").download(identity.storage_path);
    if (data) refs.push({ bytes: await data.arrayBuffer(), mimeType: data.type || "image/png", name: "character.png" });
  }

  try {
    let img: { bytes: Uint8Array | ArrayBuffer; model: string };
    if (p.image_engine === "fal" && process.env.FAL_KEY?.trim()) img = await falImage(prompt, null);
    else img = refs.length ? await editOpenAiImage(prompt, refs) : await generateOpenAiImage(prompt);
    const imagePath = await storeImage(c.owner_id, c.id, index, img.bytes);
    await setFrame({ scene: index, source: "openai", model: img.model, imagePath, status: "completed", url: null, visual: s.visual });
    return { scene: index, drawn: true };
  } catch (e) {
    await setFrame({ ...(frames[index] ?? { scene: index, source: "none", url: null }), status: "failed" });
    throw e;
  }
}
