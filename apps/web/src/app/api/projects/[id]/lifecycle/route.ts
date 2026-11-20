import { z } from "zod";
import { handle } from "@/lib/api/response";
import { activateProject, setLifecycle } from "@/lib/server/projects";
import { requireUser } from "@/lib/server/session";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { user } = await requireUser();
    const { action } = z.object({ action: z.enum(["activate", "pause", "resume", "stop"]) }).parse(await req.json());
    return action === "activate" ? activateProject(user.id, id) : setLifecycle(user.id, id, action);
  }, 200);
}
