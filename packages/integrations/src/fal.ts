import { AppError, ErrorCodes } from "@acs/domain";

/** Text-to-video model per scene; override with FAL_VIDEO_MODEL. */
export const FAL_DEFAULT_MODEL = "fal-ai/ltx-video";
export const FAL_COMPOSE_MODEL = "fal-ai/ffmpeg-api/compose";
/** Seconds each generated scene clip is assumed to run when composing. */
export const SCENE_CLIP_SECONDS = 5;

export type FalStatus = "queued" | "in_progress" | "completed" | "failed";

function falKey(): string {
  const key = process.env.FAL_KEY?.trim();
  if (!key) throw new AppError(ErrorCodes.NOT_CONFIGURED, "FAL_KEY is not configured", 503);
  return key;
}

export function falVideoModel(): string {
  return process.env.FAL_VIDEO_MODEL?.trim() || FAL_DEFAULT_MODEL;
}

/** Submit any fal queue job; returns the request id. */
export async function falSubmit(model: string, input: Record<string, unknown>): Promise<string> {
  const res = await fetch(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: { Authorization: `Key ${falKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new AppError(ErrorCodes.PROVIDER_ERROR, `fal submit ${model} failed (${res.status})`, 502, {
      body: (await res.text()).slice(0, 300),
    });
  }
  const json = (await res.json()) as { request_id?: string };
  if (!json.request_id) throw new AppError(ErrorCodes.PROVIDER_ERROR, "fal returned no request id", 502);
  return json.request_id;
}

/** Poll a fal queue job; `result` is the model output once completed. */
export async function falPoll<T = Record<string, unknown>>(
  model: string,
  requestId: string,
): Promise<{ status: FalStatus; result: T | null }> {
  const key = falKey();
  // Status/result URLs use the app id without sub-path (e.g. fal-ai/ffmpeg-api).
  const appId = model.split("/").slice(0, 2).join("/");
  const base = `https://queue.fal.run/${appId}/requests/${encodeURIComponent(requestId)}`;
  const res = await fetch(`${base}/status`, { headers: { Authorization: `Key ${key}` } });
  if (!res.ok) throw new AppError(ErrorCodes.PROVIDER_ERROR, `fal status failed (${res.status})`, 502);
  const status = mapStatus(((await res.json()) as { status?: string }).status);
  if (status !== "completed") return { status, result: null };

  const out = await fetch(base, { headers: { Authorization: `Key ${key}` } });
  if (!out.ok) return { status: "failed", result: null };
  return { status, result: (await out.json()) as T };
}

/** Prompt for one scene clip: style from the Creative Kit + the scene direction. */
export function scenePrompt(input: {
  visualStyle?: string;
  visual?: string;
  motion?: string;
  heading?: string;
  fallback: string;
}): string {
  return [
    input.visual || input.heading || input.fallback,
    input.motion ? `Camera/motion: ${input.motion}.` : "",
    input.visualStyle ? `Style: ${input.visualStyle}.` : "",
    "Vertical 9:16 short-form video, cinematic lighting, no text overlays.",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 1800);
}

export function sceneVideoInput(prompt: string): Record<string, unknown> {
  return { prompt, aspect_ratio: "9:16", resolution: "720p" };
}

/** fal compose payload: scene clips back-to-back, optional narration track. */
export function composeInput(clipUrls: string[], narrationUrl?: string | null) {
  const ms = SCENE_CLIP_SECONDS * 1000;
  const tracks: Record<string, unknown>[] = [
    {
      id: "video",
      type: "video",
      keyframes: clipUrls.map((url, i) => ({ timestamp: i * ms, duration: ms, url })),
    },
  ];
  if (narrationUrl) {
    tracks.push({
      id: "narration",
      type: "audio",
      keyframes: [{ timestamp: 0, duration: clipUrls.length * ms, url: narrationUrl }],
    });
  }
  return { tracks };
}

export function extractVideoUrl(result: unknown): string | null {
  const r = result as { video?: { url?: string }; video_url?: string } | null;
  return r?.video?.url ?? r?.video_url ?? null;
}

function mapStatus(status?: string): FalStatus {
  switch ((status ?? "").toUpperCase()) {
    case "COMPLETED":
    case "OK":
      return "completed";
    case "FAILED":
    case "ERROR":
      return "failed";
    case "IN_PROGRESS":
      return "in_progress";
    default:
      return "queued";
  }
}

/** ElevenLabs narration (optional). Returns null when no key is configured. */
export async function synthesizeNarration(text: string): Promise<ArrayBuffer | null> {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key || !text.trim()) return null;
  const voice = process.env.ELEVENLABS_VOICE_ID?.trim() || "21m00Tcm4TlvDq8ikWAM";
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text: text.slice(0, 2500), model_id: "eleven_multilingual_v2" }),
  });
  if (!res.ok) throw new AppError(ErrorCodes.PROVIDER_ERROR, `ElevenLabs failed (${res.status})`, 502);
  return res.arrayBuffer();
}
