import { z } from "zod";
import { handle } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { completeNotification } from "@/lib/server/internal";

export async function POST(req: Request) {
  return handle(async () => {
    assertInternalServiceAuth(req);
    return completeNotification(z.object({ notificationId: z.string().uuid(), delivered: z.boolean() }).parse(await req.json()));
  });
}
