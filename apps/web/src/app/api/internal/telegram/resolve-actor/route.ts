import { AppError, ErrorCodes } from "@acs/domain";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const ResolveActorSchema = z.object({
  updateId: z.union([z.string(), z.number()]).optional(),
  chatId: z.union([z.string(), z.number()]).optional(),
  telegramUserId: z.union([z.string(), z.number()]),
  messageId: z.union([z.string(), z.number()]).optional(),
  text: z.string().optional(),
  correlationId: z.string().optional(),
});

/**
 * POST /api/internal/telegram/resolve-actor
 * Maps a Telegram sender to a Studio owner via telegram_links.
 */
export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();

  try {
    assertInternalServiceAuth(request);
    const body = ResolveActorSchema.parse(await request.json());
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
        "id, owner_id, telegram_user_id, telegram_chat_id, linked_at, revoked_at, default_conversation_id, preferred_project_id, notifications_enabled",
      )
      .eq("telegram_user_id", telegramUserId)
      .is("revoked_at", null)
      .maybeSingle();

    if (!link || !link.linked_at) {
      return jsonOk(
        {
          linked: false,
          ownerId: null,
          telegramUserId,
          chatId: body.chatId ?? null,
          reason: link ? "link_incomplete" : "not_linked",
        },
        body.correlationId ?? correlationId,
      );
    }

    return jsonOk(
      {
        linked: true,
        ownerId: link.owner_id,
        linkId: link.id,
        telegramUserId: link.telegram_user_id,
        chatId: body.chatId ?? link.telegram_chat_id,
        defaultConversationId: link.default_conversation_id,
        preferredProjectId: link.preferred_project_id,
        notificationsEnabled: link.notifications_enabled,
        updateId: body.updateId ?? null,
        messageId: body.messageId ?? null,
        textPreview: body.text?.slice(0, 200) ?? null,
      },
      body.correlationId ?? correlationId,
    );
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
