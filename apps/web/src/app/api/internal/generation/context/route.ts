import { z } from "zod";
import { handle } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { generationContext } from "@/lib/server/internal";

export async function POST(req: Request) {
  return handle(async () => {
    assertInternalServiceAuth(req);
    return generationContext(z.object({ runId: z.string().uuid() }).parse(await req.json()).runId);
  });
}
