import { z } from "zod";
import { handle } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { startRender } from "@/lib/server/renders";
export const maxDuration = 300;
export async function POST(req: Request) {
  return handle(async () => {
    assertInternalServiceAuth(req);
    return startRender(z.object({ renderId: z.string().uuid() }).parse(await req.json()).renderId);
  });
}
