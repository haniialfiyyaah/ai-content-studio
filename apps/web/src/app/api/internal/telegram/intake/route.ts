import {
  AppError,
  ErrorCodes,
  appendMessage,
  createConversation,
  detectActionableIntent,
  startPlanningRun,
} from "@acs/domain";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const IntakeSchema = z.object({
  telegramUserId: z.union([z.string(), z.number()]),
  chatId: z.union([z.string(), z.number()]).optional(),
  updateId: z.union([z.string(), z.number()]),
  messageId: z.union([z.string(), z.number()]).optional(),
  text: z.string().min(1).max(20000),
  correlationId: z.string().optional(),
});

/**
 * POST /api/internal/telegram/intake
 * Deduped Telegram message → conversation + optional planning run for linked owners.
 */
export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();

  try {
    assertInternalServiceAuth(request);
    const body = IntakeSchema.parse(await request.json());
    const supabase = createAdminClient();

    const telegramUserId = Number(body.telegramUserId);
    if (!Number.isFinite(telegramUserId)) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        "Invalid telegramUserId",
        400,
      );
    }

    const { data: link } = await supabase
      .from("telegram_links")
      .select(
        "id, owner_id, telegram_chat_id, linked_at, revoked_at, default_conversation_id, preferred_project_id",
      )
      .eq("telegram_user_id", telegramUserId)
      .is("revoked_at", null)
      .maybeSingle();

    if (!link?.linked_at) {
      throw new AppError(
        ErrorCodes.FORBIDDEN,
        "Telegram account is not linked",
        403,
      );
    }

    const ownerId = link.owner_id;
    const sourceMessageId = `tg:${String(body.updateId)}`;
    const requestCorrelationId = body.correlationId ?? correlationId;

    // Transport dedupe — same Telegram update must not create parallel runs.
    const { data: existingMessage } = await supabase
      .from("agent_messages")
      .select("id, conversation_id")
      .eq("source_surface", "telegram")
      .eq("source_message_id", sourceMessageId)
      .maybeSingle();

    if (existingMessage) {
      const { data: existingRun } = await supabase
        .from("workflow_runs")
        .select("id, status, stage")
        .eq("idempotency_key", `project_planning:${existingMessage.id}`)
        .maybeSingle();

      return jsonOk(
        {
          claim: existingRun ? ("duplicate" as const) : ("needs_input" as const),
          ownerId,
          conversationId: existingMessage.conversation_id,
          messageId: existingMessage.id,
          runId: existingRun?.id ?? null,
          correlationId: requestCorrelationId,
        },
        requestCorrelationId,
      );
    }

    let conversationId = link.default_conversation_id;
    let projectId = link.preferred_project_id;

    if (conversationId) {
      const { data: existingConversation } = await supabase
        .from("agent_conversations")
        .select("id, project_id, owner_id")
        .eq("id", conversationId)
        .eq("owner_id", ownerId)
        .maybeSingle();

      if (!existingConversation) {
        conversationId = null;
      } else {
        projectId = existingConversation.project_id ?? projectId;
      }
    }

    if (!conversationId) {
      const conversation = await createConversation(supabase, {
        ownerId,
        projectId,
        title: body.text.slice(0, 80),
      });
      conversationId = conversation.id;

      await supabase
        .from("telegram_links")
        .update({ default_conversation_id: conversationId })
        .eq("id", link.id);
    }

    const message = await appendMessage(supabase, {
      conversationId,
      ownerId,
      role: "user",
      content: body.text,
      sourceSurface: "telegram",
      sourceMessageId,
    });

    const actionable = detectActionableIntent(body.text);

    if (!actionable) {
      return jsonOk(
        {
          claim: "needs_input" as const,
          ownerId,
          conversationId,
          messageId: message.id,
          runId: null,
          correlationId: requestCorrelationId,
        },
        requestCorrelationId,
      );
    }

    const run = await startPlanningRun(supabase, {
      ownerId,
      conversationId,
      messageId: message.id,
      projectId,
      correlationId: requestCorrelationId,
    });

    await supabase.from("outbox_events").insert({
      owner_id: ownerId,
      event_type: "agent.project_planning.requested",
      payload: {
        runId: run.id,
        conversationId,
        messageId: message.id,
        correlationId: requestCorrelationId,
        source: "telegram",
        updateId: String(body.updateId),
      },
      aggregate_type: "workflow_run",
      aggregate_id: run.id,
      status: "pending",
    });

    // Prefer ACS_API_BASE_URL (n8n/service canonical host) over NEXT_PUBLIC_APP_URL,
    // which may still point at an older Vercel alias.
    const appUrl = (
      process.env.ACS_API_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://ai-content-studio-one-sigma.vercel.app"
    ).replace(/\/$/, "");

    return jsonOk(
      {
        claim: "acquired" as const,
        ownerId,
        conversationId,
        messageId: message.id,
        runId: run.id,
        correlationId: requestCorrelationId,
        deepLink: `${appUrl}/`,
      },
      requestCorrelationId,
    );
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
