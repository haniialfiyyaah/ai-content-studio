import { after } from "next/server";
import { handle } from "@/lib/api/response";
import { publishNow, runPublishJob } from "@/lib/server/publishing";
import { requireUser } from "@/lib/server/session";

export const maxDuration = 300;

/** Upload this video to YouTube right now (no schedule needed). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { user } = await requireUser();
    const { jobId } = await publishNow(user.id, id);
    after(() => runPublishJob(jobId).then(() => undefined));
    return { publishing: true };
  });
}
