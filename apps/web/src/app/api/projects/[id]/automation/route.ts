import { z } from "zod";
import { handle } from "@/lib/api/response";
import { updateAutomation } from "@/lib/server/projects";
import { requireUser } from "@/lib/server/session";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { user } = await requireUser();
    const body = z.object({ ideationEnabled: z.boolean(), everyDays: z.number().int().min(1).max(60) }).parse(await req.json());
    return updateAutomation(user.id, id, body);
  }, 200);
}
