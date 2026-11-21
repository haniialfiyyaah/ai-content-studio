import { z } from "zod";
import { handle } from "@/lib/api/response";
import { requireUser } from "@/lib/server/session";
import { setupAction } from "@/lib/server/setup";

/** Setup buttons: continue to the next stage, retry the current one, or dismiss a similar-project hint. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { user } = await requireUser();
    const { action, targetId } = z
      .object({ action: z.enum(["continue", "retry", "start_new", "use_similar"]), targetId: z.string().uuid().optional() })
      .parse(await req.json());
    return setupAction(user.id, id, action, targetId);
  }, 200);
}
