import {
  BROWSER_RENDER_INTERRUPTED,
  AppError,
  ErrorCodes,
  failVideoJob,
} from "@acs/domain";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const InterruptBodySchema = z.object({
  reason: z
    .enum(["user_cancelled", "tab_closed", "compatibility", "render_error"])
    .default("user_cancelled"),
  message: z.string().max(500).optional(),
});

/**
 * POST /api/video-jobs/[id]/browser-render/interrupt
 * Marks the remotion job failed/interrupted when the browser export stops
 * before a verified MP4 upload (cancel, tab close, codec failure).
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

    const body = InterruptBodySchema.parse(
      await request.json().catch(() => ({})),
    );

    const { data: ownedJob, error: ownedError } = await supabase
      .from("video_jobs")
      .select("id, status, production_mode")
      .eq("id", jobId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (ownedError || !ownedJob) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Video job not found", 404);
    }

    // Already terminal — no-op success (e.g. complete raced with unload).
    if (
      ownedJob.status === "ready_for_review" ||
      ownedJob.status === "approved" ||
      ownedJob.status === "failed"
    ) {
      return jsonOk(
        {
          jobId: ownedJob.id,
          interrupted: false,
          status: ownedJob.status,
          message: "Job already terminal",
        },
        correlationId,
      );
    }

    const admin = createAdminClient();
    const failed = await failVideoJob(admin, {
      jobId: ownedJob.id,
      category: BROWSER_RENDER_INTERRUPTED,
      message:
        body.message ??
        `Browser Remotion export interrupted (${body.reason})`,
      correlationId,
    });

    await admin
      .from("video_attempts")
      .update({
        error_details: {
          message: BROWSER_RENDER_INTERRUPTED,
          reason: body.reason,
          backend: "browser",
          awaitingBrowser: false,
        },
      })
      .eq("id", failed.attempt.id);

    return jsonOk(
      {
        jobId: failed.job.id,
        attemptId: failed.attempt.id,
        interrupted: true,
        status: failed.job.status,
        reason: body.reason,
      },
      correlationId,
    );
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
