import {
  AppError,
  ErrorCodes,
  setInitialLaunchSelection,
} from "@acs/domain";
import { SetInitialLaunchInputSchema } from "@acs/schemas";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";

/**
 * PATCH /api/projects/[id]/initial-launch
 * Body: { conceptIds: string[], expectedVersion: number }
 */
export async function PATCH(
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

    const body = SetInitialLaunchInputSchema.parse(await request.json());
    const result = await setInitialLaunchSelection(supabase, {
      projectId,
      ownerId: user.id,
      conceptIds: body.conceptIds,
      expectedVersion: body.expectedVersion,
    });

    return jsonOk(result, correlationId);
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
