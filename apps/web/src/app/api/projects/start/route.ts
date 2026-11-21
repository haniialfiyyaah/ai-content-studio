import { z } from "zod";
import { handle } from "@/lib/api/response";
import { requireUser } from "@/lib/server/session";
import { startSetup } from "@/lib/server/setup";

/** A rough idea opens a guided setup chat (docs/FLOW.md) — nothing is generated yet. */
export async function POST(req: Request) {
  return handle(async () => {
    const { user } = await requireUser();
    const body = z.object({ prompt: z.string().min(1).max(2000) }).passthrough().parse(await req.json());
    return startSetup(user.id, body.prompt);
  }, 201);
}
