import { notFound } from "@acs/domain";
import { handle } from "@/lib/api/response";
import { generateIdentityReference } from "@/lib/server/identity";
import { requireUser } from "@/lib/server/session";

export const maxDuration = 120;

/** (Re)generate the project's main character reference image. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { supabase } = await requireUser();
    const { data } = await supabase.from("projects").select("id").eq("id", id).maybeSingle();
    if (!data) throw notFound("Project");
    return generateIdentityReference(id, { replace: true });
  });
}
