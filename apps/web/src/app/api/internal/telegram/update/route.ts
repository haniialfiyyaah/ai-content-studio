import { handle } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { handleTelegramUpdate } from "@/lib/server/telegram";

export const maxDuration = 120;

/** WF-A2 forwards every Telegram update (messages + button taps) here. */
export async function POST(req: Request) {
  return handle(async () => {
    assertInternalServiceAuth(req);
    const body = (await req.json()) as { update?: unknown };
    return handleTelegramUpdate((body.update ?? body) as Parameters<typeof handleTelegramUpdate>[0]);
  });
}
