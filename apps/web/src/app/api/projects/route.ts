import { z } from "zod";
import { VISUAL_SOURCES } from "@acs/domain";
import { handle } from "@/lib/api/response";
import { requireUser } from "@/lib/server/session";
import { startSetup } from "@/lib/server/setup";

/** Start a project from a rough idea: similar check first, then the guided setup (docs/FLOW.md). */
export async function POST(req: Request) {
  return handle(async () => {
    const { user } = await requireUser();
    const { idea, auto, visualSource } = z
      .object({ idea: z.string().trim().min(1).max(2000), auto: z.boolean().default(false), visualSource: z.enum(VISUAL_SOURCES).default("ai") })
      .parse(await req.json());
    return startSetup(user.id, idea, { auto, visualSource });
  }, 201);
}
