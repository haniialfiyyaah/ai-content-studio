import { handle } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { setupComplete } from "@/lib/server/setup";

/** WF-05: the agent's reply and/or a stage result (concept, kit, pillars). */
export async function POST(req: Request) {
  return handle(async () => {
    assertInternalServiceAuth(req);
    return setupComplete(await req.json());
  });
}
