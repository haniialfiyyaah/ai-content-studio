import { ProjectSettingsSchema } from "@acs/domain";
import { handle } from "@/lib/api/response";
import { updateProjectSettings } from "@/lib/server/projects";
import { requireUser } from "@/lib/server/session";

/** Project settings, any subset: schedule, ending, imageEngine, visualMode, autoApprove. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { user } = await requireUser();
    return updateProjectSettings(user.id, id, ProjectSettingsSchema.parse(await req.json()));
  });
}
