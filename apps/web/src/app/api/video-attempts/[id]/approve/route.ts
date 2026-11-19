import { AppError, ErrorCodes, approveVideoAttempt } from "@acs/domain";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/video-attempts/[id]/approve — approve a ready_for_review attempt.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const correlationId = crypto.randomUUID();

  try {
    const { id: attemptId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new AppError(ErrorCodes.UNAUTHENTICATED, "Not signed in", 401);
    }

    const result = await approveVideoAttempt(supabase, {
      attemptId,
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
