import {
  AppError,
  ErrorCodes,
  approveConceptVersion,
} from "@acs/domain";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/concept-versions/[id]/approve — approve an exact immutable version.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const correlationId = crypto.randomUUID();

  try {
    const { id: versionId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new AppError(ErrorCodes.UNAUTHENTICATED, "Not signed in", 401);
    }

    const result = await approveConceptVersion(supabase, {
      versionId,
      ownerId: user.id,
      actorId: user.id,
      requestId: correlationId,
      correlationId,
    });

    return jsonOk(result, correlationId);
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
