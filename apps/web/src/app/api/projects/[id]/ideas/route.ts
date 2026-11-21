import { z } from "zod";
import { handle } from "@/lib/api/response";
import { generateMore } from "@/lib/server/projects";
import { requireUser } from "@/lib/server/session";

/** New content ideas for this project, optionally from a brief (the creator's idea or a chosen angle). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { user } = await requireUser();
    const { count, brief } = z
      .object({ count: z.number().int().min(1).max(8).default(3), brief: z.string().trim().max(1500).optional() })
      .parse(await req.json().catch(() => ({})));
    return generateMore(user.id, id, count, "web", brief || undefined);
  }, 202);
}
