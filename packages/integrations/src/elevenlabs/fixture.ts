import {
  ACS_ELEVENLABS_DEMO_MODEL,
  ACS_ELEVENLABS_DEMO_VOICE_ID,
  ACS_FIXTURE_NARRATION_URL,
  estimateElevenLabsDemoCost,
} from "../media-defaults";

/**
 * Deterministic ElevenLabs fixture used when ACS_ELEVENLABS_FIXTURE_MODE=true
 * or when no ElevenLabs credentials are configured.
 */
export interface ElevenLabsTtsRequest {
  text: string;
  voiceId?: string;
  modelId?: string;
}

export interface ElevenLabsTtsFixtureResult {
  provider: "elevenlabs";
  fixture: true;
  providerRequestId: string;
  status: "completed";
  audioUrl: string;
  audioBase64: null;
  voiceId: string;
  modelId: string;
  characters: number;
  estimatedCost: number;
  estimatedDurationMs: number;
}

export function fixtureElevenLabsTts(
  request: ElevenLabsTtsRequest,
): ElevenLabsTtsFixtureResult {
  const voiceId = request.voiceId ?? ACS_ELEVENLABS_DEMO_VOICE_ID;
  const modelId = request.modelId ?? ACS_ELEVENLABS_DEMO_MODEL;
  const characters = request.text.length;
  const providerRequestId = `eleven-fixture-${simpleHash(request.text)}`;
  const cost = estimateElevenLabsDemoCost({ characters, model: modelId });
  // ~14 chars/sec speaking rate for duration planning.
  const estimatedDurationMs = Math.max(1500, Math.round((characters / 14) * 1000));

  return {
    provider: "elevenlabs",
    fixture: true,
    providerRequestId,
    status: "completed",
    audioUrl: ACS_FIXTURE_NARRATION_URL,
    audioBase64: null,
    voiceId,
    modelId,
    characters,
    estimatedCost: cost.estimateUsd,
    estimatedDurationMs,
  };
}

function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33 + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
