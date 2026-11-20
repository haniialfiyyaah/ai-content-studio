import { AppError, ErrorCodes } from "@acs/domain";

/**
 * OpenAI image generation for scene images (primary provider).
 * Model: OPENAI_IMAGE_MODEL (default gpt-image-1), falling back to
 * gpt-image-1-mini if the configured model is rejected/unavailable.
 */
export const OPENAI_IMAGE_MODEL = "gpt-image-1";
export const OPENAI_IMAGE_FALLBACK_MODEL = "gpt-image-1-mini";

export function openAiImagesConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

const key = () => {
  const k = process.env.OPENAI_API_KEY?.trim();
  if (!k) throw new AppError(ErrorCodes.NOT_CONFIGURED, "OPENAI_API_KEY is not configured", 503);
  return k;
};

const quality = () => (process.env.OPENAI_IMAGE_QUALITY?.trim() || "medium") as "low" | "medium" | "high";

export interface ImageRef {
  bytes: ArrayBuffer;
  mimeType: string;
  name: string;
}

async function call(path: string, init: RequestInit): Promise<Uint8Array> {
  const res = await fetch(`https://api.openai.com/v1/images/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key()}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(120_000),
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: { b64_json?: string }[];
    error?: { message?: string; code?: string; type?: string };
  };
  if (!res.ok) {
    const msg = json.error?.message ?? `HTTP ${res.status}`;
    const code = [401, 403].includes(res.status) || json.error?.code === "insufficient_quota"
      ? ErrorCodes.NOT_CONFIGURED
      : ErrorCodes.PROVIDER_ERROR;
    throw new AppError(code, `OpenAI image failed: ${msg}`.slice(0, 300), res.status >= 500 ? 502 : 400, {
      status: res.status,
      modelError: res.status === 404 || /model/i.test(msg),
    });
  }
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new AppError(ErrorCodes.PROVIDER_ERROR, "OpenAI returned no image", 502);
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

function isModelError(e: unknown) {
  return e instanceof AppError && Boolean((e.details as { modelError?: boolean } | undefined)?.modelError);
}

async function withModelFallback(run: (model: string) => Promise<Uint8Array>) {
  const primary = process.env.OPENAI_IMAGE_MODEL?.trim() || OPENAI_IMAGE_MODEL;
  try {
    return { bytes: await run(primary), model: primary };
  } catch (e) {
    if (!isModelError(e) || primary === OPENAI_IMAGE_FALLBACK_MODEL) throw e;
    return { bytes: await run(OPENAI_IMAGE_FALLBACK_MODEL), model: OPENAI_IMAGE_FALLBACK_MODEL };
  }
}

/** Text → vertical PNG (1024×1536). */
export function generateOpenAiImage(prompt: string) {
  return withModelFallback((model) =>
    call("generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: prompt.slice(0, 3800), size: "1024x1536", quality: quality(), n: 1 }),
    }),
  );
}

/** Reference-guided image (the user's upload keeps products/characters consistent). */
export function editOpenAiImage(prompt: string, refs: ImageRef[]) {
  return withModelFallback((model) => {
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", `${prompt} Keep the subject from the reference image recognisable and consistent.`.slice(0, 3800));
    form.append("size", "1024x1536");
    form.append("quality", quality());
    for (const r of refs.slice(0, 4)) form.append("image[]", new Blob([r.bytes], { type: r.mimeType }), r.name);
    return call("edits", { method: "POST", body: form });
  });
}
