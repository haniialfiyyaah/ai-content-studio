import { z } from "zod";
import { handle } from "@/lib/api/response";
import { generateMore } from "@/lib/server/projects";
import { requireUser } from "@/lib/server/session";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { user } = await requireUser();
    const { count } = z.object({ count: z.number().int().min(1).max(8).default(3) }).parse(await req.json().catch(() => ({})));
    return generateMore(user.id, id, count);
  }, 202);
}
