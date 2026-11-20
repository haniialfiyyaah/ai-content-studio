import { z } from "zod";
import { handle } from "@/lib/api/response";
import { reviseContents } from "@/lib/server/projects";
import { requireUser } from "@/lib/server/session";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { user } = await requireUser();
    const { feedback } = z.object({ feedback: z.string().min(3).max(1500) }).parse(await req.json());
    return reviseContents(user.id, id, feedback);
  }, 202);
}
