import { EndingSchema } from "@acs/domain";
import { handle } from "@/lib/api/response";
import { saveEnding } from "@/lib/server/projects";
import { requireUser } from "@/lib/server/session";

/** How every Short in this project ends (CTA, @handle, website, series teaser). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { user } = await requireUser();
    return saveEnding(user.id, id, EndingSchema.parse(await req.json()));
  });
}
