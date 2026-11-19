import {
  AppError,
  ErrorCodes,
  createPublishingJob,
  listPublishingJobs,
} from "@acs/domain";
import { CreatePublishingJobInputSchema } from "@acs/schemas";
import { jsonAccepted, jsonError, jsonOk } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/publishing-jobs — list publishing intents for the owner.
 */
export async function GET() {
  const correlationId = crypto.randomUUID();

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new AppError(ErrorCodes.UNAUTHENTICATED, "Not signed in", 401);
    }

    const jobs = await listPublishingJobs(supabase, { ownerId: user.id });
    return jsonOk({ jobs }, correlationId);
  } catch (error) {
    return jsonError(error, correlationId);
  }
}

/**
 * POST /api/publishing-jobs — create a draft_intent publishing skeleton job.
 */
export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new AppError(ErrorCodes.UNAUTHENTICATED, "Not signed in", 401);
    }

    const body = CreatePublishingJobInputSchema.parse(await request.json());
    const result = await createPublishingJob(supabase, {
      ownerId: user.id,
      input: body,
      correlationId,
    });

    return jsonAccepted(result, correlationId);
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
