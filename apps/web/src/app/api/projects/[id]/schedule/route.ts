import { handle } from "@/lib/api/response";
import { saveSchedule } from "@/lib/server/projects";
import { requireUser } from "@/lib/server/session";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { user } = await requireUser();
    return saveSchedule(user.id, id, await req.json());
  }, 200);
}
