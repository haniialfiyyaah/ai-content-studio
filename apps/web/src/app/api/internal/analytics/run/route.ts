import { z } from "zod";
import { handle } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { captureAnalytics } from "@/lib/server/publishing";
export const maxDuration = 300;
export async function POST(req: Request) {
  return handle(async () => {
    assertInternalServiceAuth(req);
    return captureAnalytics(z.object({ publishJobId: z.string().uuid() }).parse(await req.json()).publishJobId);
  });
}
