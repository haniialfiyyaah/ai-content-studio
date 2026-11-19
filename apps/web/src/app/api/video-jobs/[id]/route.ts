import { AppError, ErrorCodes, getVideoJob } from "@acs/domain";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/video-jobs/[id] — job detail with all attempts.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const correlationId = crypto.randomUUID();

  try {
    const { id: jobId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new AppError(ErrorCodes.UNAUTHENTICATED, "Not signed in", 401);
    }

    const result = await getVideoJob(supabase, {
      jobId,
      ownerId: user.id,
    });

    return jsonOk(result, correlationId);
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
