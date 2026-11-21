import { z } from "zod";
import { handle } from "@/lib/api/response";
import { holdContent } from "@/lib/server/projects";
import { requireUser } from "@/lib/server/session";

/** Hold (never publish until resumed) or resume a content that already has images or a video. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { user } = await requireUser();
    const { hold } = z.object({ hold: z.boolean() }).parse(await req.json());
    return holdContent(user.id, id, hold);
  }, 200);
}
