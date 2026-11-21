import { z } from "zod";
import { handle } from "@/lib/api/response";
import { launchProject } from "@/lib/server/projects";
import { requireUser } from "@/lib/server/session";

const Body = z.object({
  include: z.array(z.string().uuid()).max(100).default([]),
  exclude: z.array(z.string().uuid()).max(100).default([]),
});

/** One step: set aside the unticked ideas, approve the rest, schedule and go live. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { user } = await requireUser();
    return launchProject(user.id, id, Body.parse(await req.json()));
  }, 200);
}
