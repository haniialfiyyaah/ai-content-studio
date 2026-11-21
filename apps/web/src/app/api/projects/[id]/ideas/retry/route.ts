import { handle } from "@/lib/api/response";
import { retryGeneration } from "@/lib/server/projects";
import { requireUser } from "@/lib/server/session";

/** Re-run the last failed idea run. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { user } = await requireUser();
    return retryGeneration(user.id, id);
  }, 202);
}
