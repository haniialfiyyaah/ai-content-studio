import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appUrl } from "./session";

type Admin = SupabaseClient;

export async function logActivity(
  admin: Admin,
  e: { ownerId: string; projectId?: string | null; kind: string; message: string; payload?: Record<string, unknown> },
) {
  await admin.from("activity_events").insert({
    owner_id: e.ownerId,
    project_id: e.projectId ?? null,
    kind: e.kind,
    message: e.message,
    payload: e.payload ?? {},
  });
}

/**
 * Queues a Telegram message for WF-06 when the owner has an active link with
 * notifications on. Never sends inline — delivery is the workflow's job.
 */
export async function notifyTelegram(
  admin: Admin,
  n: {
    ownerId: string;
    projectId?: string | null;
    template: string;
    text: string;
    path?: string;
    /** Send content cards for these contents (or all drafts) with Approve/Edit buttons. */
    cards?: { contentIds?: string[] };
    /** Send the rendered MP4 itself. */
    renderId?: string;
    /** Extra inline keyboard rows (callback data). */
    buttons?: { text: string; data?: string; url?: string }[][];
    /** Mirror into the project's agent chat (default true; false when the caller already posted there). */
    chat?: boolean;
  },
) {
  // Every alert also lands in the project chat, so the dashboard and Telegram tell the same story.
  if (n.projectId && n.chat !== false) {
    await postAssistantMessage(admin, n.ownerId, n.projectId, n.text).catch(() => undefined);
  }
  const { data: link } = await admin
    .from("telegram_links")
    .select("telegram_chat_id, notifications_enabled")
    .eq("owner_id", n.ownerId)
    .is("revoked_at", null)
    .maybeSingle();
  if (!link?.telegram_chat_id || !link.notifications_enabled) return;

  await admin.from("notifications").insert({
    owner_id: n.ownerId,
    project_id: n.projectId ?? null,
    channel: "telegram",
    template: n.template,
    payload: {
      chatId: String(link.telegram_chat_id),
      text: n.text,
      url: n.path ? `${appUrl()}${n.path}` : null,
      cards: n.cards ?? null,
      renderId: n.renderId ?? null,
      buttons: n.buttons ?? null,
    },
  });
}

export async function postAssistantMessage(admin: Admin, ownerId: string, projectId: string, content: string) {
  const { data: convo } = await admin
    .from("conversations")
    .select("id")
    .eq("project_id", projectId)
    .eq("channel", "web")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!convo) return;
  await admin.from("messages").insert({ conversation_id: convo.id, owner_id: ownerId, role: "assistant", content });
}
