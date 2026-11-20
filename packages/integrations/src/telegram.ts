import { AppError, ErrorCodes } from "@acs/domain";

/** Inline keyboard button: callback `data` (≤64 bytes) or an `url`. */
export interface TgButton {
  text: string;
  data?: string;
  url?: string;
}

function token() {
  const t = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!t) throw new AppError(ErrorCodes.NOT_CONFIGURED, "TELEGRAM_BOT_TOKEN is not configured", 503);
  return t;
}

export function telegramConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
}

async function call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!json.ok) {
    throw new AppError(ErrorCodes.PROVIDER_ERROR, `Telegram ${method} failed: ${json.description ?? res.status}`, 502);
  }
  return json.result as T;
}

const keyboard = (rows?: TgButton[][]) =>
  rows?.length
    ? {
        reply_markup: {
          inline_keyboard: rows.map((r) =>
            r.map((b) => (b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: (b.data ?? "noop").slice(0, 64) })),
          ),
        },
      }
    : {};

/** Escape user/AI text for parse_mode=HTML. */
export const tgEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function tgSendMessage(chatId: string | number, html: string, rows?: TgButton[][]) {
  return call("sendMessage", {
    chat_id: chatId,
    text: html.slice(0, 4000),
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...keyboard(rows),
  });
}

/** Sends an MP4 by URL (Telegram fetches it; ≤20 MB) as a playable video. */
export function tgSendVideo(chatId: string | number, videoUrl: string, captionHtml: string, rows?: TgButton[][]) {
  return call("sendVideo", {
    chat_id: chatId,
    video: videoUrl,
    caption: captionHtml.slice(0, 1000),
    parse_mode: "HTML",
    supports_streaming: true,
    ...keyboard(rows),
  });
}

export function tgAnswerCallback(callbackId: string, text?: string) {
  return call("answerCallbackQuery", { callback_query_id: callbackId, ...(text ? { text: text.slice(0, 190) } : {}) }).catch(() => undefined);
}

export function tgSendChatAction(chatId: string | number, action: "typing" | "upload_video" = "typing") {
  return call("sendChatAction", { chat_id: chatId, action }).catch(() => undefined);
}

/** Splits long HTML text into ≤3900-char chunks on blank lines. */
export function chunkMessages(blocks: string[], max = 3900): string[] {
  const out: string[] = [];
  let cur = "";
  for (const b of blocks) {
    if ((cur + "\n\n" + b).length > max && cur) {
      out.push(cur);
      cur = b;
    } else cur = cur ? `${cur}\n\n${b}` : b;
  }
  if (cur) out.push(cur);
  return out;
}
