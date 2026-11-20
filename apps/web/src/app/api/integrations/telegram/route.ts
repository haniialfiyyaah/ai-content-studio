import { z } from "zod";
import { conflict } from "@acs/domain";
import { handle } from "@/lib/api/response";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/server/session";

const Body = z.object({ telegramUserId: z.string().regex(/^\d{4,15}$/, "Use your numeric Telegram user ID") });

export async function POST(req: Request) {
  return handle(async () => {
    const { user } = await requireUser();
    const { telegramUserId } = Body.parse(await req.json());
    const db = createAdminClient();
    const { data: taken } = await db
      .from("telegram_links")
      .select("owner_id")
      .eq("telegram_user_id", telegramUserId)
      .is("revoked_at", null)
      .maybeSingle();
    if (taken && taken.owner_id !== user.id) throw conflict("That Telegram account is linked to another Studio user");
    await db.from("telegram_links").update({ revoked_at: new Date().toISOString() }).eq("owner_id", user.id).is("revoked_at", null);
    await db.from("telegram_links").insert({ owner_id: user.id, telegram_user_id: Number(telegramUserId) });
    return { linked: true };
  }, 201);
}

export async function PATCH(req: Request) {
  return handle(async () => {
    const { user, supabase } = await requireUser();
    const { notificationsEnabled } = z.object({ notificationsEnabled: z.boolean() }).parse(await req.json());
    await supabase.from("telegram_links").update({ notifications_enabled: notificationsEnabled }).eq("owner_id", user.id).is("revoked_at", null);
    return { notificationsEnabled };
  });
}

export async function DELETE() {
  return handle(async () => {
    const { user } = await requireUser();
    await createAdminClient().from("telegram_links").update({ revoked_at: new Date().toISOString() }).eq("owner_id", user.id).is("revoked_at", null);
    return { linked: false };
  });
}
