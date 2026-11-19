import { AppError, ErrorCodes } from "@acs/schemas";
import {
  ACS_ELEVENLABS_DEMO_MODEL,
  ACS_ELEVENLABS_DEMO_VOICE_ID,
  estimateElevenLabsDemoCost,
} from "../media-defaults";
import {
  fixtureElevenLabsTts,
  type ElevenLabsTtsFixtureResult,
  type ElevenLabsTtsRequest,
} from "./fixture";

export interface ElevenLabsExecuteOptions {
  fixtureMode: boolean;
  apiKey?: string | null;
}

export type ElevenLabsTtsResult =
  | ElevenLabsTtsFixtureResult
  | {
      provider: "elevenlabs";
      fixture: false;
      providerRequestId: string;
      status: "completed";
      audioUrl: string | null;
      audioBase64: string | null;
      voiceId: string;
      modelId: string;
      characters: number;
      estimatedCost: number;
      estimatedDurationMs: number;
    };

/**
 * Synthesizes speech via ElevenLabs TTS.
 * Fixture mode is explicit; live calls require ELEVENLABS_API_KEY.
 */
export async function executeElevenLabsTts(
  request: ElevenLabsTtsRequest,
  options: ElevenLabsExecuteOptions,
): Promise<ElevenLabsTtsResult> {
  const key = options.apiKey?.trim() || null;
  const fixtureMode =
    options.fixtureMode ||
    process.env.ACS_ELEVENLABS_FIXTURE_MODE === "true" ||
    !key;

  if (fixtureMode || !key) {
    return fixtureElevenLabsTts(request);
  }

  const voiceId = request.voiceId ?? ACS_ELEVENLABS_DEMO_VOICE_ID;
  const modelId = request.modelId ?? ACS_ELEVENLABS_DEMO_MODEL;

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: request.text,
        model_id: modelId,
      }),
    },
  );

  if (!response.ok) {
    throw new AppError(
      response.status === 429
        ? ErrorCodes.AI_PROVIDER_RATE_LIMITED
        : ErrorCodes.PROVIDER_UNAVAILABLE,
      "ElevenLabs TTS failed",
      response.status >= 500 ? 502 : 400,
      { status: response.status, provider: "elevenlabs" },
    );
  }

  const ab = await response.arrayBuffer();
  const audioBase64 = Buffer.from(ab).toString("base64");
  const providerRequestId =
    response.headers.get("request-id") ??
    `eleven-live-${Date.now().toString(16)}`;
  const characters = request.text.length;
  const cost = estimateElevenLabsDemoCost({ characters, model: modelId });
  const estimatedDurationMs = Math.max(
    1500,
    Math.round((characters / 14) * 1000),
  );

  return {
    provider: "elevenlabs",
    fixture: false,
    providerRequestId,
    status: "completed",
    audioUrl: null,
    audioBase64,
    voiceId,
    modelId,
    characters,
    estimatedCost: cost.estimateUsd,
    estimatedDurationMs,
  };
}
