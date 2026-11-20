import { handle } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { agentReply } from "@/lib/server/internal";

export async function POST(req: Request) {
  return handle(async () => {
    assertInternalServiceAuth(req);
    return agentReply(await req.json());
  });
}
