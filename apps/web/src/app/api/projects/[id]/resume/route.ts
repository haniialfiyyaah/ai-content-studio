import { AppError, ErrorCodes, resumeProject } from "@acs/domain";
import { ProjectLifecycleInputSchema } from "@acs/schemas";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/projects/[id]/resume — paused|stopped → active.
 * Does not re-run the initial-launch gate.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const correlationId = crypto.randomUUID();

  try {
    const { id: projectId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new AppError(ErrorCodes.UNAUTHENTICATED, "Not signed in", 401);
    }

    const body = ProjectLifecycleInputSchema.parse(await request.json());
    const project = await resumeProject(supabase, {
      projectId,
      ownerId: user.id,
      expectedVersion: body.expectedVersion,
      actorId: user.id,
      correlationId,
    });

    return jsonOk({ project }, correlationId);
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
