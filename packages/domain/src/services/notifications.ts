/** Minimal query surface for queuing deliverable notifications. */
export interface NotificationsDbClient {
  from: (table: string) => any;
}

export interface QueueTelegramNotificationParams {
  ownerId: string;
  projectId: string | null;
  template: string;
  previewText: string;
  deepLinkPath: string;
  payload?: Record<string, unknown>;
}

/**
 * Queues a `notifications` row for WF-06 to deliver over Telegram, but only
 * when the owner has an active, notification-enabled Telegram link. Never
 * sends synchronously — the agent/render path does not wait on delivery.
 */
export async function queueTelegramNotification(
  supabase: NotificationsDbClient,
  params: QueueTelegramNotificationParams,
): Promise<boolean> {
  const { data: telegramLink } = await supabase
    .from("telegram_links")
    .select("id, telegram_chat_id, notifications_enabled")
    .eq("owner_id", params.ownerId)
    .is("revoked_at", null)
    .maybeSingle();

  if (
    !telegramLink ||
    telegramLink.notifications_enabled === false ||
    !telegramLink.telegram_chat_id
  ) {
    return false;
  }

  const appUrl = (
    process.env.ACS_API_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ""
  ).replace(/\/$/, "");
  const deepLink = appUrl
    ? `${appUrl}${params.deepLinkPath}`
    : params.deepLinkPath;

  await supabase.from("notifications").insert({
    owner_id: params.ownerId,
    project_id: params.projectId,
    channel: "telegram",
    template: params.template,
    payload: {
      ...params.payload,
      chatId: telegramLink.telegram_chat_id,
      previewText: params.previewText,
      deepLink,
    },
    delivery_state: "pending",
  });

  return true;
}
