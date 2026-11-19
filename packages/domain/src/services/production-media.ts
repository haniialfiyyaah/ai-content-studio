import {
  executeElevenLabsTts,
  executeFalRender,
  ACS_FAL_DEMO_MODEL,
  ACS_ELEVENLABS_DEMO_MODEL,
  estimateElevenLabsDemoCost,
  estimateFalDemoCost,
} from "@acs/integrations";
import { AppError, ErrorCodes } from "@acs/schemas";

export interface PrepareProductionMediaParams {
  ownerId: string;
  projectId: string;
  conceptId: string;
  jobId: string;
  title: string;
  prompt: string;
  narrationText: string;
  includeFootage?: boolean;
  includeNarration?: boolean;
  falModel?: string;
  elevenLabsModel?: string;
  elevenLabsVoiceId?: string;
  falFixtureMode: boolean;
  elevenLabsFixtureMode: boolean;
  falApiKey?: string | null;
  elevenLabsApiKey?: string | null;
}

export interface ProductionMediaBundle {
  footageUrl: string | null;
  narrationUrl: string | null;
  narrationDurationMs: number | null;
  fal: {
    fixture: boolean;
    providerRequestId: string | null;
    model: string;
    estimatedCost: number;
    status: string;
  } | null;
  narration: {
    fixture: boolean;
    providerRequestId: string | null;
    model: string;
    estimatedCost: number;
    characters: number;
    status: string;
    /** Present only for live TTS — API must upload then clear. */
    audioBase64?: string | null;
  } | null;
  costEstimateUsd: number;
  failures: string[];
}

/**
 * Resolves fal footage + ElevenLabs narration for a remotion browser/hybrid job.
 * Fixture mode returns CORS-friendly sample URLs — never pretends live spend.
 * Live failures are collected so Remotion can still export captions-only.
 */
export async function prepareProductionMedia(
  params: PrepareProductionMediaParams,
): Promise<ProductionMediaBundle> {
  const includeFootage = params.includeFootage !== false;
  const includeNarration =
    params.includeNarration !== false && params.narrationText.trim().length > 0;

  const failures: string[] = [];
  let footageUrl: string | null = null;
  let narrationUrl: string | null = null;
  let narrationDurationMs: number | null = null;
  let falMeta: ProductionMediaBundle["fal"] = null;
  let narrationMeta: ProductionMediaBundle["narration"] = null;

  if (includeFootage) {
    try {
      const falModel = params.falModel ?? ACS_FAL_DEMO_MODEL;
      const fal = await executeFalRender(
        {
          prompt: params.prompt || params.title,
          model: falModel,
          aspectRatio: "16:9",
        },
        {
          fixtureMode: params.falFixtureMode,
          apiKey: params.falApiKey,
        },
      );

      footageUrl = fal.outputUrl;
      falMeta = {
        fixture: fal.fixture,
        providerRequestId: fal.providerRequestId,
        model: fal.model,
        estimatedCost: fal.estimatedCost,
        status: fal.status,
      };

      if (!fal.fixture && fal.status !== "completed") {
        failures.push(
          `fal status ${fal.status} — footage may be unavailable until poll completes`,
        );
      }
    } catch (error) {
      failures.push(
        error instanceof Error ? error.message : "fal footage generation failed",
      );
    }
  }

  if (includeNarration) {
    try {
      const modelId = params.elevenLabsModel ?? ACS_ELEVENLABS_DEMO_MODEL;
      const tts = await executeElevenLabsTts(
        {
          text: params.narrationText.slice(0, 2500),
          modelId,
          voiceId: params.elevenLabsVoiceId,
        },
        {
          fixtureMode: params.elevenLabsFixtureMode,
          apiKey: params.elevenLabsApiKey,
        },
      );

      narrationUrl = tts.audioUrl;
      narrationDurationMs =
        "estimatedDurationMs" in tts ? tts.estimatedDurationMs : null;
      narrationMeta = {
        fixture: tts.fixture,
        providerRequestId: tts.providerRequestId,
        model: tts.modelId,
        estimatedCost: tts.estimatedCost,
        characters: tts.characters,
        status: tts.status,
        audioBase64:
          !tts.fixture && "audioBase64" in tts ? tts.audioBase64 : null,
      };
    } catch (error) {
      failures.push(
        error instanceof Error
          ? error.message
          : "ElevenLabs narration generation failed",
      );
    }
  }

  const costEstimateUsd =
    (falMeta?.estimatedCost ?? 0) + (narrationMeta?.estimatedCost ?? 0);

  return {
    footageUrl,
    narrationUrl,
    narrationDurationMs,
    fal: falMeta,
    narration: narrationMeta,
    costEstimateUsd,
    failures,
  };
}

/** Advisory preflight costs without invoking providers. */
export function estimateProductionMediaCost(params: {
  narrationCharacters: number;
  falModel?: string;
  elevenLabsModel?: string;
  durationSeconds?: number;
}): { fal: number; narration: number; total: number; notes: string[] } {
  const fal = estimateFalDemoCost({
    model: params.falModel,
    durationSeconds: params.durationSeconds,
  });
  const narration = estimateElevenLabsDemoCost({
    characters: params.narrationCharacters,
    model: params.elevenLabsModel,
  });

  return {
    fal: fal.estimateUsd,
    narration: narration.estimateUsd,
    total: Number((fal.estimateUsd + narration.estimateUsd).toFixed(4)),
    notes: [fal.basis, narration.basis],
  };
}

export function assertOwnedJobOrThrow(
  job: { owner_id: string } | null,
  ownerId: string,
): void {
  if (!job) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Video job not found", 404);
  }
  if (job.owner_id !== ownerId) {
    throw new AppError(ErrorCodes.FORBIDDEN, "Not allowed", 403);
  }
}
