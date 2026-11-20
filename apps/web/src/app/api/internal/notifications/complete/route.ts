import { z } from "zod";
import { handle } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { completeNotification } from "@/lib/server/telegram";

export async function POST(req: Request) {
  return handle(async () => {
    assertInternalServiceAuth(req);
    const b = z.object({ notificationId: z.string().uuid(), delivered: z.boolean() }).parse(await req.json());
    return completeNotification(b.notificationId, b.delivered);
  });
}
