import { AppError, ErrorCodes } from "@acs/domain";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";

const LinkBodySchema = z.object({
  telegramUserId: z.coerce.number().int().positive(),
  telegramChatId: z.coerce.number().int().positive().optional(),
});

/**
 * GET /api/integrations/telegram — current owner's active Telegram link.
 */
export async function GET() {
  const correlationId = crypto.randomUUID();

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new AppError(ErrorCodes.UNAUTHENTICATED, "Not signed in", 401);
    }

    const { data: link, error } = await supabase
      .from("telegram_links")
      .select(
        "id, telegram_user_id, telegram_chat_id, linked_at, notifications_enabled",
      )
      .eq("owner_id", user.id)
      .is("revoked_at", null)
      .maybeSingle();

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL, error.message, 500);
    }

    return jsonOk(
      {
        linked: Boolean(link),
        link: link
          ? {
              id: link.id,
              telegramUserId: link.telegram_user_id,
              telegramChatId: link.telegram_chat_id,
              linkedAt: link.linked_at,
              notificationsEnabled: link.notifications_enabled,
            }
          : null,
      },
      correlationId,
    );
  } catch (error) {
    return jsonError(error, correlationId);
  }
}

/**
 * POST /api/integrations/telegram — link this Studio account to a Telegram user.
 */
export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new AppError(ErrorCodes.UNAUTHENTICATED, "Not signed in", 401);
    }

    const body = LinkBodySchema.parse(await request.json());
    const telegramChatId = body.telegramChatId ?? body.telegramUserId;
    const now = new Date().toISOString();

    // One active Telegram identity per Studio owner.
    await supabase
      .from("telegram_links")
      .update({ revoked_at: now })
      .eq("owner_id", user.id)
      .is("revoked_at", null);

    // One Studio owner per Telegram user.
    await supabase
      .from("telegram_links")
      .update({ revoked_at: now })
      .eq("telegram_user_id", body.telegramUserId)
      .is("revoked_at", null);

    const { data: link, error } = await supabase
      .from("telegram_links")
      .insert({
        owner_id: user.id,
        telegram_user_id: body.telegramUserId,
        telegram_chat_id: telegramChatId,
        linked_at: now,
        revoked_at: null,
        notifications_enabled: true,
      })
      .select(
        "id, telegram_user_id, telegram_chat_id, linked_at, notifications_enabled",
      )
      .single();

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL, error.message, 500);
    }

    return jsonOk(
      {
        linked: true,
        link: {
          id: link.id,
          telegramUserId: link.telegram_user_id,
          telegramChatId: link.telegram_chat_id,
          linkedAt: link.linked_at,
          notificationsEnabled: link.notifications_enabled,
        },
      },
      correlationId,
    );
  } catch (error) {
    return jsonError(error, correlationId);
  }
}

/**
 * DELETE /api/integrations/telegram — revoke the active Telegram link.
 */
export async function DELETE() {
  const correlationId = crypto.randomUUID();

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new AppError(ErrorCodes.UNAUTHENTICATED, "Not signed in", 401);
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("telegram_links")
      .update({ revoked_at: now })
      .eq("owner_id", user.id)
      .is("revoked_at", null);

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL, error.message, 500);
    }

    return jsonOk({ linked: false, link: null }, correlationId);
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
