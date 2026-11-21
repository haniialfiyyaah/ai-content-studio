import { z } from "zod";
import { CONTENT_ACTIONS } from "@acs/domain";
import { handle } from "@/lib/api/response";
import { contentAction } from "@/lib/server/content-actions";
import { requireUser } from "@/lib/server/session";

// storyboard and publish keep working after the response (after()).
export const maxDuration = 300;

/** approve · remove · hold · resume · unlock · storyboard · render · publish */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { user } = await requireUser();
    const { action } = z.object({ action: z.enum(CONTENT_ACTIONS) }).parse(await req.json());
    return contentAction(user.id, id, action);
  });
}
