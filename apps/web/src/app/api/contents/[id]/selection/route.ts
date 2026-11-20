import { z } from "zod";
import { OPTION_FIELDS } from "@acs/domain";
import { handle } from "@/lib/api/response";
import { selectOption } from "@/lib/server/projects";
import { requireUser } from "@/lib/server/session";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { user } = await requireUser();
    const body = z.object({ field: z.enum(OPTION_FIELDS), index: z.number().int().min(0) }).parse(await req.json());
    return selectOption(user.id, id, body.field, body.index);
  }, 200);
}
