import { handle } from "@/lib/api/response";
import { kickGeneration } from "@/lib/server/projects";
import { requireUser } from "@/lib/server/session";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { user } = await requireUser();
    return kickGeneration(user.id, id);
  }, 202);
}
