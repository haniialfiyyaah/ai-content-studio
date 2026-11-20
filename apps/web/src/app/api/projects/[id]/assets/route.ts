import { z } from "zod";
import { handle } from "@/lib/api/response";
import { registerAsset } from "@/lib/server/assets";
import { requireUser } from "@/lib/server/session";

const Body = z.object({
  path: z.string().min(1),
  label: z.string().max(120).optional(),
  mimeType: z.string(),
  size: z.number().int().positive(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { user } = await requireUser();
    return registerAsset(user.id, id, Body.parse(await req.json()));
  }, 201);
}
