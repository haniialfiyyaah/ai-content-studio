import { z } from "zod";
import { IMAGE_ENGINES } from "@acs/domain";
import { handle } from "@/lib/api/response";
import { setImageEngine } from "@/lib/server/assets";
import { requireUser } from "@/lib/server/session";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { user } = await requireUser();
    const { imageEngine } = z.object({ imageEngine: z.enum(IMAGE_ENGINES) }).parse(await req.json());
    return setImageEngine(user.id, id, imageEngine);
  });
}
