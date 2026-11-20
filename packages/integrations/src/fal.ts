import { AppError, ErrorCodes } from "@acs/domain";

/**
 * Scene images for the Remotion renderer. Stylized by design (Creative Kit
 * visual style), not photoreal. Models are overridable via env.
 */
export const FAL_IMAGE_MODEL = "fal-ai/flux/dev";
export const FAL_IMAGE_FALLBACK_MODEL = "fal-ai/flux/schnell";
/** Image-conditioned model used when the project has reference uploads. */
export const FAL_REFERENCE_MODEL = "fal-ai/flux-pro/kontext";

export type FalStatus = "queued" | "in_progress" | "completed" | "failed";

function falKey(): string {
  const key = process.env.FAL_KEY?.trim();
  if (!key) throw new AppError(ErrorCodes.NOT_CONFIGURED, "FAL_KEY is not configured", 503);
  return key;
}

export const falImageModel = () => process.env.FAL_IMAGE_MODEL?.trim() || FAL_IMAGE_MODEL;
export const falReferenceModel = () => process.env.FAL_REFERENCE_MODEL?.trim() || FAL_REFERENCE_MODEL;

/** Submit any fal queue job; returns the request id. 401/402/403 → NOT_CONFIGURED (billing/key). */
export async function falSubmit(model: string, input: Record<string, unknown>): Promise<string> {
  const res = await fetch(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: { Authorization: `Key ${falKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    if ([401, 402, 403].includes(res.status)) {
      throw new AppError(
        ErrorCodes.NOT_CONFIGURED,
        `fal rejected the request (${res.status}) — check FAL_KEY and that the fal account has credit`,
        503,
        { body },
      );
    }
    throw new AppError(ErrorCodes.PROVIDER_ERROR, `fal submit ${model} failed (${res.status})`, 502, { body });
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

export function extractImageUrl(result: unknown): string | null {
  const r = result as { images?: { url?: string }[]; image?: { url?: string } } | null;
  return r?.images?.[0]?.url ?? r?.image?.url ?? null;
}

const OVERLAY_LAYOUTS = new Set(["points", "code", "compare", "stat", "statement", "quote"]);

/**
 * Layout-aware scene image prompt (content-video skill §5): the image is a
 * background under the overlay, in one consistent visual identity.
 */
export function sceneImagePrompt(input: {
  visual?: string;
  heading?: string;
  layout?: string;
  visualStyle?: string;
  palette?: string;
  recurringSubject?: string;
  fallback: string;
}) {
  const layout = input.layout ?? "image";
  const subject = input.visual || input.heading || input.fallback;
  const composition = OVERLAY_LAYOUTS.has(layout)
    ? "Calm, low-detail background illustration. Main subject small in the lower third; the upper half is mostly empty soft space for overlaid text."
    : layout === "product"
      ? "Clean product hero shot, centered, simple uncluttered background."
      : layout === "cta"
        ? "Soft celebratory background, subject looking at the camera, lots of empty space in the upper half."
        : "Bold subject large in frame, dynamic angle, subject in the lower 60 percent of the frame.";
  return [
    `Scene: ${subject}.`,
    composition,
    input.recurringSubject ? `Recurring character/subject (keep identical across scenes when present): ${input.recurringSubject}.` : "",
    `Art style: ${input.visualStyle || "polished flat vector illustration, thick outlines, soft shading"}.`,
    input.palette ? `Color palette: ${input.palette}.` : "",
    "Vertical 9:16. No text, no letters, no numbers, no logos, no UI screens, no watermark.",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 1800);
}

export function textToImageInput(prompt: string) {
  return { prompt, image_size: "portrait_16_9", num_images: 1, enable_safety_checker: true };
}

export function referenceImageInput(prompt: string, imageUrl: string) {
  return {
    prompt: `${prompt} Keep the subject from the reference image recognisable and consistent.`,
    image_url: imageUrl,
    aspect_ratio: "9:16",
    num_images: 1,
  };
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

// ---------------------------------------------------------------------------
// ElevenLabs narration with word timings (drives burned-in captions)
// ---------------------------------------------------------------------------
export interface CaptionWord {
  text: string;
  start: number;
  end: number;
}

export function narrationConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
}

let cachedVoice: string | null = null;

/**
 * Voices to try, best first. Free plans can't use Voice Library voices via the
 * API (402) — those show up as category "professional" (or with sharing info),
 * so try premade defaults first, then the account's own generated/cloned ones.
 */
async function candidateVoices(key: string): Promise<string[]> {
  const res = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": key } });
  if (!res.ok) return [];
  const json = (await res.json()) as { voices?: { voice_id: string; category?: string; sharing?: unknown }[] };
  const rank = (c?: string) => (c === "premade" ? 0 : c === "generated" ? 1 : c === "cloned" ? 2 : 9);
  return (json.voices ?? [])
    .filter((v) => v.category !== "professional")
    .sort((x, y) => rank(x.category) - rank(y.category))
    .map((v) => v.voice_id)
    .slice(0, 5);
}

async function tts(key: string, voice: string, text: string) {
  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text: text.slice(0, 2500), model_id: "eleven_multilingual_v2" }),
  });
}

/** Returns MP3 bytes + word timings, or null when ElevenLabs isn't configured. */
export async function synthesizeNarration(text: string): Promise<{ audio: Uint8Array; words: CaptionWord[]; voice: string } | null> {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key || !text.trim()) return null;

  const configured = process.env.ELEVENLABS_VOICE_ID?.trim();
  const tried = new Set<string>();
  const order = [configured, cachedVoice].filter((v): v is string => Boolean(v));
  let res: Response | null = null;
  let voice = "";

  const attempt = async (v: string) => {
    if (tried.has(v)) return false;
    tried.add(v);
    voice = v;
    res = await tts(key, v, text);
    return res.ok;
  };

  let ok = false;
  for (const v of order) if ((ok = await attempt(v))) break;
  if (!ok) {
    // Plan/voice refusals → walk the account's usable voices.
    for (const v of await candidateVoices(key)) {
      if ((ok = await attempt(v))) break;
      const status = (res as Response | null)?.status ?? 0;
      if (![402, 403, 404, 422].includes(status)) break; // other errors won't be fixed by another voice
    }
  }
  const final = res as Response | null;
  if (!final) throw new AppError(ErrorCodes.PROVIDER_ERROR, "ElevenLabs: no usable voice found on this account", 502);
  if (!final.ok) {
    const body = await final.text().catch(() => "");
    let reason = body.slice(0, 200);
    try {
      const j = JSON.parse(body) as { detail?: { message?: string; status?: string } | string };
      reason = typeof j.detail === "string" ? j.detail : j.detail?.message ?? j.detail?.status ?? reason;
    } catch {}
    throw new AppError(ErrorCodes.PROVIDER_ERROR, `ElevenLabs ${final.status} (tried ${tried.size} voice(s)): ${reason}`.slice(0, 280), 502);
  }
  cachedVoice = voice;
  const json = (await final.json()) as {
    audio_base64: string;
    alignment?: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] };
  };
  return { audio: Uint8Array.from(Buffer.from(json.audio_base64, "base64")), words: wordsFromAlignment(json.alignment), voice };
}

export function wordsFromAlignment(a?: {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}): CaptionWord[] {
  if (!a) return [];
  const words: CaptionWord[] = [];
  let cur: CaptionWord | null = null;
  a.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (cur) words.push(cur);
      cur = null;
      return;
    }
    if (!cur) cur = { text: ch, start: a.character_start_times_seconds[i], end: a.character_end_times_seconds[i] };
    else {
      cur.text += ch;
      cur.end = a.character_end_times_seconds[i];
    }
  });
  if (cur) words.push(cur);
  return words;
}

/** Evenly timed captions when there is no voice-over (≈2.6 words/second). */
export function evenCaptions(text: string, startAt = 0.3): CaptionWord[] {
  const step = 1 / 2.6;
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => ({ text: w, start: startAt + i * step, end: startAt + (i + 1) * step - 0.04 }));
}
