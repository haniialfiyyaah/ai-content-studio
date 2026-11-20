import { z } from "zod";
import { VISUAL_MODES } from "@acs/domain";
import { handle } from "@/lib/api/response";
import { setVisualMode } from "@/lib/server/assets";
import { requireUser } from "@/lib/server/session";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { user } = await requireUser();
    const { visualMode } = z.object({ visualMode: z.enum(VISUAL_MODES) }).parse(await req.json());
    return setVisualMode(user.id, id, visualMode);
  });
}
