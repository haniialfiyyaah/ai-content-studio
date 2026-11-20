import { z } from "zod";
import { handle } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { deliverNotification } from "@/lib/server/telegram";

export const maxDuration = 120;

export async function POST(req: Request) {
  return handle(async () => {
    assertInternalServiceAuth(req);
    const { notificationId } = z.object({ notificationId: z.string().uuid() }).parse(await req.json());
    return deliverNotification(notificationId);
  });
}
