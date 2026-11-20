import { handle } from "@/lib/api/response";
import { retryRender } from "@/lib/server/projects";
import { requireUser } from "@/lib/server/session";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { user } = await requireUser();
    return retryRender(user.id, id);
  }, 202);
}
