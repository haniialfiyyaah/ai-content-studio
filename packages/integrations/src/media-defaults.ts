/**
 * Demo-oriented provider defaults and cost estimates (advisory only).
 * No live calls are made from this module.
 */

/** Cost-first fal text-to-video for MVP demos (~$0.02 / video). */
export const ACS_FAL_DEMO_MODEL = "fal-ai/ltx-video";

/**
 * Higher-quality option when budget allows (~$0.01875/s → ~$0.094 for 5s).
 * Prefer ACS_FAL_DEMO_MODEL for capstone cost control.
 */
export const ACS_FAL_QUALITY_MODEL = "minimax/h3-max-turbo/text-to-video";

/** Cheaper ElevenLabs TTS model for short narration. */
export const ACS_ELEVENLABS_DEMO_MODEL = "eleven_flash_v2_5";

/** Default public voice (Rachel) — override via ELEVENLABS_VOICE_ID. */
export const ACS_ELEVENLABS_DEMO_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

/**
 * CORS-friendly Remotion sample media used in fixture mode so the browser
 * renderer can still compose real Video/Audio tags without paid providers.
 */
export const ACS_FIXTURE_FOOTAGE_URL = "https://remotion.media/video.mp4";
export const ACS_FIXTURE_NARRATION_URL = "https://remotion.media/audio.wav";

export interface FalCostEstimate {
  model: string;
  estimateUsd: number;
  basis: string;
}

export function estimateFalDemoCost(params?: {
  model?: string;
  durationSeconds?: number;
}): FalCostEstimate {
  const model = params?.model ?? ACS_FAL_DEMO_MODEL;
  const durationSeconds = params?.durationSeconds ?? 5;

  if (model === ACS_FAL_DEMO_MODEL || model.includes("ltx-video")) {
    return {
      model,
      estimateUsd: 0.02,
      basis: "fal pricing API: $0.02 per video (advisory)",
    };
  }

  if (model.includes("h3-max-turbo")) {
    return {
      model,
      estimateUsd: Number((0.01875 * durationSeconds).toFixed(4)),
      basis: `fal pricing API: $0.01875/s × ${durationSeconds}s (advisory)`,
    };
  }

  return {
    model,
    estimateUsd: 0.1,
    basis: "Unknown model — placeholder advisory estimate",
  };
}

export interface ElevenLabsCostEstimate {
  model: string;
  characters: number;
  estimateUsd: number;
  basis: string;
}

/**
 * Advisory Flash TTS estimate. Live billing follows ElevenLabs plan/credits.
 * Flash list rates are typically far below multilingual_v2; we use ~$0.06/1k chars.
 */
export function estimateElevenLabsDemoCost(params: {
  characters: number;
  model?: string;
}): ElevenLabsCostEstimate {
  const model = params.model ?? ACS_ELEVENLABS_DEMO_MODEL;
  const perThousand = model.includes("flash") ? 0.06 : 0.18;
  const estimateUsd = Number(
    ((params.characters / 1000) * perThousand).toFixed(4),
  );

  return {
    model,
    characters: params.characters,
    estimateUsd,
    basis: `Advisory ~$${perThousand}/1k chars for ${model} (confirm on ElevenLabs plan)`,
  };
}
