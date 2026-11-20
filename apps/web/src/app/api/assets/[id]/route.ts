import { handle } from "@/lib/api/response";
import { deleteAsset } from "@/lib/server/assets";
import { requireUser } from "@/lib/server/session";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { user } = await requireUser();
    return deleteAsset(user.id, id);
  });
}
