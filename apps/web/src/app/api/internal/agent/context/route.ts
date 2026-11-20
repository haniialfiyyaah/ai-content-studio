import { z } from "zod";
import { handle } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { agentContext } from "@/lib/server/internal";

export async function POST(req: Request) {
  return handle(async () => {
    assertInternalServiceAuth(req);
    return agentContext(z.object({ conversationId: z.string().uuid() }).parse(await req.json()).conversationId);
  });
}
