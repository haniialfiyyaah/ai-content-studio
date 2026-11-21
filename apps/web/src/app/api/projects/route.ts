import { z } from "zod";
import { handle } from "@/lib/api/response";
import { requireUser } from "@/lib/server/session";
import { startSetup } from "@/lib/server/setup";

/** Start a project from a rough idea: similar check first, then the guided setup (docs/FLOW.md). */
export async function POST(req: Request) {
  return handle(async () => {
    const { user } = await requireUser();
    const { idea } = z.object({ idea: z.string().trim().min(1).max(2000) }).parse(await req.json());
    return startSetup(user.id, idea);
  }, 201);
}
