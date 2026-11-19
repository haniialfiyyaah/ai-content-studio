import { AppError, ErrorCodes } from "@acs/domain";
import { executeOpenAi } from "@acs/integrations";
import {
  AiExecuteRequestSchema,
  OpenAiModeSchema,
} from "@acs/schemas";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const ExecuteBodySchema = AiExecuteRequestSchema.extend({
  mode: OpenAiModeSchema.optional(),
  byokApiKey: z.string().min(1).optional(),
});

/**
 * POST /api/internal/ai/execute
 * Trusted gateway for n8n — resolves mode, never mixes BYOK with managed keys.
 */
export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();

  try {
    assertInternalServiceAuth(request);
    const body = ExecuteBodySchema.parse(await request.json());
    const supabase = createAdminClient();

    const { data: prefs } = await supabase
      .from("ai_provider_preferences")
      .select("openai_mode")
      .eq("owner_id", body.ownerId)
      .maybeSingle();

    const mode = body.mode ?? prefs?.openai_mode ?? "managed";

    // BYOK ciphertext stays server-side; callers may pass a decrypted key once.
    let byokApiKey = body.byokApiKey ?? null;
    if (mode === "byok" && !byokApiKey) {
      // Connection presence is enough for fixture; live path needs decrypted key.
      const { data: connection } = await supabase
        .from("ai_provider_connections")
        .select("status")
        .eq("owner_id", body.ownerId)
        .eq("provider", "openai")
        .maybeSingle();

      if (connection?.status !== "connected") {
        throw new AppError(
          ErrorCodes.BYOK_KEY_INVALID,
          "Bring-your-own OpenAI key is missing or not connected",
          400,
        );
      }
    }

    const fixtureMode =
      process.env.ACS_AI_FIXTURE_MODE === "true" ||
      (!process.env.OPENAI_API_KEY && mode === "managed");

    const result = await executeOpenAi(
      {
        ownerId: body.ownerId,
        purpose: body.purpose,
        model: body.model,
        messages: body.messages,
        responseFormat: body.responseFormat,
        projectId: body.projectId,
        workflowRunId: body.workflowRunId,
        correlationId: body.correlationId ?? correlationId,
      },
      {
        fixtureMode,
        managedApiKey: process.env.OPENAI_API_KEY ?? null,
        byokApiKey,
        mode,
      },
    );

    return jsonOk(result, body.correlationId ?? correlationId);
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
