import { z } from "zod";
import {
  ACS_ELEVENLABS_DEMO_MODEL,
  executeElevenLabsTts,
} from "@acs/integrations";
import { jsonError, jsonOk } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";

const ElevenBodySchema = z.object({
  text: z.string().min(1).max(5000),
  voiceId: z.string().max(100).optional(),
  modelId: z.string().max(100).optional(),
  correlationId: z.string().optional(),
});

/**
 * POST /api/internal/media/elevenlabs — TTS for n8n (fixture or live).
 * Live audio base64 is returned only when credentials + fixtureMode=false.
 * Do not log response bodies containing audio.
 */
export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();

  try {
    assertInternalServiceAuth(request);
    const body = ElevenBodySchema.parse(await request.json());
    const fixtureMode = process.env.ACS_ELEVENLABS_FIXTURE_MODE !== "false";
    const apiKey = process.env.ELEVENLABS_API_KEY ?? null;

    const result = await executeElevenLabsTts(
      {
        text: body.text,
        voiceId: body.voiceId ?? process.env.ELEVENLABS_VOICE_ID ?? undefined,
        modelId: body.modelId ?? ACS_ELEVENLABS_DEMO_MODEL,
      },
      { fixtureMode, apiKey },
    );

    // Strip large base64 from envelope when present — callers that need bytes
    // should use a dedicated storage upload path; n8n only needs status IDs.
    const { audioBase64, ...safe } = result as typeof result & {
      audioBase64?: string | null;
    };

    return jsonOk(
      {
        ...safe,
        hasAudioBytes: Boolean(audioBase64),
        audioByteLength: audioBase64
          ? Buffer.from(audioBase64, "base64").byteLength
          : 0,
      },
      body.correlationId ?? correlationId,
    );
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
