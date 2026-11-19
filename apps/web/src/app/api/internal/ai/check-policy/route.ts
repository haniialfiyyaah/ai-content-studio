import { prepareOpenAiExecution, AppError, ErrorCodes } from "@acs/domain";
import {
  AiProviderConnectionStatusSchema,
  OpenAiModeSchema,
} from "@acs/schemas";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const CheckPolicyBodySchema = z
  .object({
    ownerId: z.string().uuid().optional(),
    mode: OpenAiModeSchema.optional(),
    connectionStatus: AiProviderConnectionStatusSchema.nullable().optional(),
    managedRemaining: z.number().optional(),
    correlationId: z.string().uuid().optional(),
    runId: z.string().uuid().optional(),
    conversationId: z.string().uuid().optional(),
    messageId: z.string().uuid().optional(),
    purpose: z.string().optional(),
  })
  .refine((v) => Boolean(v.ownerId) || v.mode !== undefined, {
    message: "ownerId or mode is required",
  });

/**
 * POST /api/internal/ai/check-policy
 * n8n preflight — enforces BYOK/managed rules without provider side effects.
 * Prefer ownerId so the server loads authoritative prefs/connection/allowance.
 */
export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();

  try {
    assertInternalServiceAuth(request);
    const body = CheckPolicyBodySchema.parse(await request.json());

    if (body.ownerId) {
      const supabase = createAdminClient();
      const prepared = await prepareOpenAiExecution(supabase, body.ownerId);
      return jsonOk(
        {
          mode: prepared.mode,
          allowed: true as const,
          fixtureMode: prepared.fixtureMode,
          managedRemaining: prepared.managedRemaining,
          connectionStatus: prepared.connectionStatus,
        },
        body.correlationId ?? correlationId,
      );
    }

    // Legacy explicit fields (tests / older workflow payloads)
    const { assertAiPolicy } = await import("@acs/domain");
    if (body.mode === undefined || body.managedRemaining === undefined) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        "mode and managedRemaining required when ownerId is omitted",
        400,
      );
    }

    const result = assertAiPolicy({
      mode: body.mode,
      connectionStatus: body.connectionStatus,
      managedRemaining: body.managedRemaining,
    });

    return jsonOk(result, body.correlationId ?? correlationId);
  } catch (error) {
    if (error instanceof AppError && error.code === ErrorCodes.BYOK_KEY_INVALID) {
      return jsonError(error, correlationId);
    }
    return jsonError(error, correlationId);
  }
}
