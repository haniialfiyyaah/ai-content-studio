import {
  AppError,
  ErrorCodes,
  prepareOpenAiExecution,
} from "@acs/domain";
import { executeOpenAi } from "@acs/integrations";
import { AiExecuteRequestSchema } from "@acs/schemas";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const ExecuteBodySchema = AiExecuteRequestSchema.omit({ messages: true }).extend(
  {
    messages: AiExecuteRequestSchema.shape.messages.optional(),
    messageId: z.string().uuid().optional(),
    runId: z.string().uuid().optional(),
    conversationId: z.string().uuid().optional(),
  },
).refine((v) => Boolean(v.ownerId), {
  message: "ownerId is required",
}).refine((v) => Boolean(v.messages?.length) || Boolean(v.messageId), {
  message: "messages or messageId is required",
});

/**
 * POST /api/internal/ai/execute
 * Trusted AI Provider Gateway for n8n and server orchestration.
 * Decrypts BYOK only in-process — never returns secrets; never accepts
 * plaintext BYOK from the caller (avoids n8n execution-data leakage).
 */
export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();

  try {
    assertInternalServiceAuth(request);
    const body = ExecuteBodySchema.parse(await request.json());
    const supabase = createAdminClient();

    const prepared = await prepareOpenAiExecution(supabase, body.ownerId);

    let messages = body.messages;
    if ((!messages || messages.length === 0) && body.messageId) {
      const { data: message } = await supabase
        .from("agent_messages")
        .select("content, role, owner_id")
        .eq("id", body.messageId)
        .maybeSingle();

      if (!message || message.owner_id !== body.ownerId) {
        throw new AppError(
          ErrorCodes.NOT_FOUND,
          "Agent message not found for AI execution",
          404,
        );
      }

      messages = [
        {
          role: "user",
          content: String(message.content ?? ""),
        },
      ];
    }

    if (!messages?.length) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        "messages or messageId is required",
        400,
      );
    }

    const result = await executeOpenAi(
      {
        ownerId: body.ownerId,
        purpose: body.purpose,
        model: body.model,
        messages,
        responseFormat: body.responseFormat,
        projectId: body.projectId,
        workflowRunId: body.workflowRunId ?? body.runId,
        correlationId: body.correlationId ?? correlationId,
      },
      {
        fixtureMode: prepared.fixtureMode,
        managedApiKey: prepared.managedApiKey,
        byokApiKey: prepared.byokApiKey,
        mode: prepared.mode,
      },
    );

    // Usage ledger — store tokens only, never prompts or keys.
    await supabase.from("ai_usage_events").insert({
      owner_id: body.ownerId,
      project_id: body.projectId ?? null,
      mode: prepared.mode,
      model_id: result.model,
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
      estimated_cost: null,
      request_id: body.correlationId ?? correlationId,
      workflow_run_id: body.workflowRunId ?? body.runId ?? null,
    });

    if (prepared.mode === "managed" && !result.fixture) {
      const { data: policy } = await supabase
        .from("ai_usage_policy")
        .select("managed_used")
        .eq("owner_id", body.ownerId)
        .maybeSingle();

      const used = Number(policy?.managed_used ?? 0) + 1;
      await supabase.from("ai_usage_policy").upsert(
        {
          owner_id: body.ownerId,
          managed_used: used,
          managed_monthly_allowance: Number(
            process.env.ACS_MANAGED_MONTHLY_ALLOWANCE ?? 500,
          ),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "owner_id" },
      );
    }

    return jsonOk(
      {
        ...result,
        mode: prepared.mode,
      },
      body.correlationId ?? correlationId,
    );
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
