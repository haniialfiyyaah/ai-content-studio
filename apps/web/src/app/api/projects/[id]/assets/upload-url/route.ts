import { z } from "zod";
import { handle } from "@/lib/api/response";
import { createAssetUpload } from "@/lib/server/assets";
import { requireUser } from "@/lib/server/session";

const Body = z.object({ fileName: z.string().max(200), mimeType: z.string(), size: z.number().int().positive() });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { user } = await requireUser();
    return createAssetUpload(user.id, id, Body.parse(await req.json()));
  });
}
