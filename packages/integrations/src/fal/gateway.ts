import { AppError, ErrorCodes } from "@acs/schemas";
import { fixtureFalRender, type FalRenderRequest, type FalRenderFixtureResult } from "./fixture";

export interface FalExecuteOptions {
  fixtureMode: boolean;
  apiKey?: string | null;
}

export type FalRenderResult =
  | FalRenderFixtureResult
  | {
      provider: "fal";
      fixture: false;
      providerRequestId: string;
      status: "queued" | "in_progress" | "completed" | "failed";
      outputUrl: string | null;
      model: string;
      estimatedCost: number;
    };

/**
 * Submits a fal.ai video generation request.
 * Fixture mode is explicit; missing credentials never silently invent live success.
 */
export async function executeFalRender(
  request: FalRenderRequest,
  options: FalExecuteOptions,
): Promise<FalRenderResult> {
  const key = options.apiKey?.trim() || null;
  const fixtureMode =
    options.fixtureMode ||
    process.env.ACS_FAL_FIXTURE_MODE === "true" ||
    !key;

  if (fixtureMode || !key) {
    if (!options.fixtureMode && process.env.ACS_FAL_FIXTURE_MODE !== "true" && !key) {
      // Auto-fixture when no key — still marked fixture:true.
      return fixtureFalRender(request);
    }
    return fixtureFalRender(request);
  }

  const model = request.model ?? "fal-ai/minimax/video-01";
  const response = await fetch(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: request.prompt,
      aspect_ratio: request.aspectRatio ?? "9:16",
      ...(request.seed !== undefined ? { seed: request.seed } : {}),
    }),
  });

  if (!response.ok) {
    throw new AppError(
      response.status === 429
        ? ErrorCodes.AI_PROVIDER_RATE_LIMITED
        : ErrorCodes.PROVIDER_UNAVAILABLE,
      "fal.ai submit failed",
      response.status >= 500 ? 502 : 400,
      { status: response.status, provider: "fal" },
    );
  }

  const json = (await response.json()) as {
    request_id?: string;
    status?: string;
    video?: { url?: string };
  };

  const providerRequestId = json.request_id ?? `fal-live-${Date.now()}`;
  const status = mapFalStatus(json.status);
  const outputUrl = json.video?.url ?? null;

  return {
    provider: "fal",
    fixture: false,
    providerRequestId,
    status,
    outputUrl,
    model,
    estimatedCost: 0,
  };
}

/** Polls a previously submitted fal queue request. */
export async function pollFalRender(
  providerRequestId: string,
  options: FalExecuteOptions & { model?: string },
): Promise<FalRenderResult> {
  const key = options.apiKey?.trim() || null;
  const fixtureMode =
    options.fixtureMode ||
    process.env.ACS_FAL_FIXTURE_MODE === "true" ||
    !key;

  if (fixtureMode || !key) {
    return fixtureFalRender({
      prompt: `poll:${providerRequestId}`,
      model: options.model,
    });
  }

  const model = options.model ?? "fal-ai/minimax/video-01";
  const response = await fetch(
    `https://queue.fal.run/${model}/requests/${encodeURIComponent(providerRequestId)}/status`,
    {
      headers: { Authorization: `Key ${key}` },
    },
  );

  if (!response.ok) {
    throw new AppError(
      ErrorCodes.PROVIDER_UNAVAILABLE,
      "fal.ai status poll failed",
      502,
      { status: response.status, provider: "fal" },
    );
  }

  const json = (await response.json()) as {
    status?: string;
    video?: { url?: string };
    response_url?: string;
  };

  let outputUrl = json.video?.url ?? null;
  const status = mapFalStatus(json.status);

  if (status === "completed" && !outputUrl && json.response_url) {
    const resultRes = await fetch(json.response_url, {
      headers: { Authorization: `Key ${key}` },
    });
    if (resultRes.ok) {
      const resultJson = (await resultRes.json()) as {
        video?: { url?: string };
      };
      outputUrl = resultJson.video?.url ?? null;
    }
  }

  return {
    provider: "fal",
    fixture: false,
    providerRequestId,
    status,
    outputUrl,
    model,
    estimatedCost: 0,
  };
}

function mapFalStatus(
  status: string | undefined,
): "queued" | "in_progress" | "completed" | "failed" {
  const normalized = (status ?? "").toUpperCase();
  if (normalized === "COMPLETED" || normalized === "OK") return "completed";
  if (normalized === "FAILED" || normalized === "ERROR") return "failed";
  if (normalized === "IN_PROGRESS" || normalized === "IN_QUEUE") {
    return normalized === "IN_PROGRESS" ? "in_progress" : "queued";
  }
  return "queued";
}
