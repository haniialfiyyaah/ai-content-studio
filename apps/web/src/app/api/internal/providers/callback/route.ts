import { AppError, ErrorCodes } from "@acs/domain";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const ProviderCallbackSchema = z.object({
  mode: z
    .enum(["status_poll", "webhook", "reconcile"])
    .default("status_poll"),
  provider: z.string().min(1).max(64),
  jobId: z.string().uuid().optional(),
  attemptId: z.string().uuid().optional(),
  providerRequestId: z.string().max(200).optional(),
  status: z.string().max(64).optional(),
  correlationId: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
});

/**
 * POST /api/internal/providers/callback
 * Records async provider status polls / callbacks (stub — no provider secrets).
 */
export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();

  try {
    assertInternalServiceAuth(request);
    const body = ProviderCallbackSchema.parse(await request.json());
    const supabase = createAdminClient();

    let attemptId = body.attemptId ?? null;
    let jobId = body.jobId ?? null;
    let ownerId: string | null = null;

    if (attemptId) {
      const { data: attempt } = await supabase
        .from("video_attempts")
        .select("id, video_job_id, provider_request_id, status")
        .eq("id", attemptId)
        .maybeSingle();

      if (attempt) {
        jobId = attempt.video_job_id;
        if (
          body.providerRequestId &&
          !attempt.provider_request_id
        ) {
          await supabase
            .from("video_attempts")
            .update({ provider_request_id: body.providerRequestId })
            .eq("id", attempt.id);
        }
      }
    }

    if (jobId) {
      const { data: job } = await supabase
        .from("video_jobs")
        .select("id, owner_id, status")
        .eq("id", jobId)
        .maybeSingle();

      if (!job) {
        throw new AppError(ErrorCodes.NOT_FOUND, "Video job not found", 404);
      }
      ownerId = job.owner_id;
    }

    await supabase.from("audit_events").insert({
      owner_id: ownerId,
      actor_type: "service",
      actor_id: null,
      action: "provider.callback",
      target_type: attemptId ? "video_attempt" : jobId ? "video_job" : "provider",
      target_id: attemptId ?? jobId ?? null,
      after_summary: {
        mode: body.mode,
        provider: body.provider,
        providerRequestId: body.providerRequestId ?? null,
        status: body.status ?? null,
        stub: true,
      },
      correlation_id: body.correlationId ?? correlationId,
      source_surface: "system",
    });

    return jsonOk(
      {
        acknowledged: true,
        mode: body.mode,
        provider: body.provider,
        jobId,
        attemptId,
        providerRequestId: body.providerRequestId ?? null,
        remoteStatus: body.status ?? "unknown",
        stub: true,
      },
      body.correlationId ?? correlationId,
    );
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
