import { AppError, ErrorCodes, regenerateVideoJob } from "@acs/domain";
import { RegenerateVideoJobInputSchema } from "@acs/schemas";
import { jsonAccepted, jsonError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/video-jobs/[id]/regenerate — queue a new attempt on the job.
 */
export async function POST(
  request: Request,
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

    const body = RegenerateVideoJobInputSchema.parse(
      await request.json().catch(() => ({})),
    );

    const result = await regenerateVideoJob(supabase, {
      jobId,
      ownerId: user.id,
      reason: body.reason,
      correlationId,
    });

    return jsonAccepted(result, correlationId);
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
