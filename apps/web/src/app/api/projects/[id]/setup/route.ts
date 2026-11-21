import { z } from "zod";
import { handle } from "@/lib/api/response";
import { requireUser } from "@/lib/server/session";
import { continueGenerating, setupAction, stopGenerating } from "@/lib/server/setup";

/** Setup buttons: continue to the next stage, retry the current one, or dismiss a similar-project hint. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { user } = await requireUser();
    const { action, targetId, auto } = z
      .object({ action: z.enum(["continue", "retry", "start_new", "use_similar", "stop", "resume"]), targetId: z.string().uuid().optional(), auto: z.boolean().optional() })
      .parse(await req.json());
    if (action === "stop") return stopGenerating(user.id, id);
    if (action === "resume") return continueGenerating(user.id, id);
    return setupAction(user.id, id, action, targetId, auto);
  }, 200);
}
