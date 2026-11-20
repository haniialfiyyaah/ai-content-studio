import { z } from "zod";
import { handle } from "@/lib/api/response";
import { sendProjectMessage } from "@/lib/server/projects";
import { requireUser } from "@/lib/server/session";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { user } = await requireUser();
    const { content } = z.object({ content: z.string().min(1).max(4000) }).parse(await req.json());
    return sendProjectMessage(user.id, id, content);
  }, 201);
}
