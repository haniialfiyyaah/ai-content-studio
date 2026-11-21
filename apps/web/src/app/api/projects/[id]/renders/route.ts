import { handle } from "@/lib/api/response";
import { renderAllApproved } from "@/lib/server/projects";
import { requireUser } from "@/lib/server/session";

/** Render every approved content that has no video yet. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { user } = await requireUser();
    return renderAllApproved(user.id, id);
  }, 202);
}
