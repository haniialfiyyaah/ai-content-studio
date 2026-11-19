import { assertAiPolicy, AppError, ErrorCodes } from "@acs/domain";
import {
  AiProviderConnectionStatusSchema,
  OpenAiModeSchema,
} from "@acs/schemas";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";

const CheckPolicyBodySchema = z.object({
  mode: OpenAiModeSchema,
  connectionStatus: AiProviderConnectionStatusSchema.nullable().optional(),
  managedRemaining: z.number(),
  ownerId: z.string().uuid().optional(),
  correlationId: z.string().uuid().optional(),
});

/**
 * POST /api/internal/ai/check-policy
 * n8n preflight — enforces BYOK/managed rules without provider side effects.
 */
export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();

  try {
    assertInternalServiceAuth(request);
    const body = CheckPolicyBodySchema.parse(await request.json());

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
