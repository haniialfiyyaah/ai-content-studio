/**
 * Telegram message builders. The app never calls Telegram itself: it returns
 * these Bot API calls and n8n ("SUB Telegram Send") posts them with the bot
 * token it holds. Keeps the token and all outbound sending inside n8n.
 */

/** Inline keyboard button: callback `data` (≤64 bytes) or an `url`. */
export interface TgButton {
  text: string;
  data?: string;
  url?: string;
}

/** One Bot API request for n8n to send: POST /bot<token>/<method> with `body`. */
export interface TgCall {
  method: "sendMessage" | "sendVideo" | "answerCallbackQuery" | "sendChatAction";
  body: Record<string, unknown>;
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

export const tgMessage = (chatId: string | number, html: string, rows?: TgButton[][]): TgCall => ({
  method: "sendMessage",
  body: { chat_id: chatId, text: html.slice(0, 4000), parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...keyboard(rows) },
});

/** MP4 by URL (Telegram fetches it; ≤20 MB) as a playable video. */
export const tgVideo = (chatId: string | number, videoUrl: string, captionHtml: string, rows?: TgButton[][]): TgCall => ({
  method: "sendVideo",
  body: { chat_id: chatId, video: videoUrl, caption: captionHtml.slice(0, 1000), parse_mode: "HTML", supports_streaming: true, ...keyboard(rows) },
});

export const tgAnswer = (callbackId: string, text?: string): TgCall => ({
  method: "answerCallbackQuery",
  body: { callback_query_id: callbackId, ...(text ? { text: text.slice(0, 190) } : {}) },
});

export const tgAction = (chatId: string | number, action: "typing" | "upload_video" = "typing"): TgCall => ({
  method: "sendChatAction",
  body: { chat_id: chatId, action },
});

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
