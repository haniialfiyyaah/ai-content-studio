import { handle } from "@/lib/api/response";
import { rejectContent } from "@/lib/server/projects";
import { requireUser } from "@/lib/server/session";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { user } = await requireUser();
    return rejectContent(user.id, id);
  });
}
