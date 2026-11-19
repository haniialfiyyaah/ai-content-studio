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
  voiceId: string;
  modelId: string;
  characters: number;
  estimatedCost: number;
}

export function fixtureElevenLabsTts(
  request: ElevenLabsTtsRequest,
): ElevenLabsTtsFixtureResult {
  const voiceId = request.voiceId ?? "fixture-voice";
  const modelId = request.modelId ?? "fixture-eleven-multilingual";
  const characters = request.text.length;
  const providerRequestId = `eleven-fixture-${simpleHash(request.text)}`;

  return {
    provider: "elevenlabs",
    fixture: true,
    providerRequestId,
    status: "completed",
    audioUrl: `https://fixtures.acs.local/elevenlabs/${providerRequestId}.mp3`,
    voiceId,
    modelId,
    characters,
    estimatedCost: 0,
  };
}

function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33 + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
