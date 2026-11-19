import { z } from "zod";
import {
  ACS_FAL_DEMO_MODEL,
  executeFalRender,
  pollFalRender,
} from "@acs/integrations";
import { jsonError, jsonOk } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";

const FalBodySchema = z.object({
  action: z.enum(["submit", "poll"]).default("submit"),
  prompt: z.string().min(1).max(4000).optional(),
  model: z.string().max(200).optional(),
  aspectRatio: z.string().max(20).optional(),
  seed: z.number().int().optional(),
  providerRequestId: z.string().max(200).optional(),
  correlationId: z.string().optional(),
});

/**
 * POST /api/internal/media/fal — fal.ai submit/poll for n8n (fixture or live).
 * Never logs API keys. Paid calls only when FAL_KEY set and ACS_FAL_FIXTURE_MODE=false.
 */
export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();

  try {
    assertInternalServiceAuth(request);
    const body = FalBodySchema.parse(await request.json());
    const fixtureMode = process.env.ACS_FAL_FIXTURE_MODE !== "false";
    const apiKey = process.env.FAL_KEY ?? null;

    if (body.action === "poll") {
      if (!body.providerRequestId) {
        return jsonError(
          new Error("providerRequestId required for poll"),
          body.correlationId ?? correlationId,
        );
      }
      const result = await pollFalRender(body.providerRequestId, {
        fixtureMode,
        apiKey,
        model: body.model,
      });
      return jsonOk(result, body.correlationId ?? correlationId);
    }

    if (!body.prompt) {
      return jsonError(
        new Error("prompt required for submit"),
        body.correlationId ?? correlationId,
      );
    }

    const result = await executeFalRender(
      {
        prompt: body.prompt,
        model: body.model ?? ACS_FAL_DEMO_MODEL,
        aspectRatio: body.aspectRatio ?? "16:9",
        seed: body.seed,
      },
      { fixtureMode, apiKey },
    );

    return jsonOk(result, body.correlationId ?? correlationId);
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
