import { after } from "next/server";
import { notFound } from "@acs/domain";
import { handle } from "@/lib/api/response";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateStoryboard } from "@/lib/server/storyboard";
import { requireUser } from "@/lib/server/session";

export const maxDuration = 300;

/** Draw (or redraw) this content's storyboard images now. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { user } = await requireUser();
    const { data } = await createAdminClient().from("contents").select("id").eq("id", id).eq("owner_id", user.id).maybeSingle();
    if (!data) throw notFound("Content");
    const force = new URL(req.url).searchParams.get("force") === "1";
    await createAdminClient().from("contents").update({ storyboard_status: "generating", storyboard_started_at: null }).eq("id", id);
    after(() => generateStoryboard(id, { force: true }).then(() => undefined).catch(() => undefined));
    return { generating: true, force };
  });
}
