import {
  AWAITING_BROWSER_RENDER,
  AppError,
  ErrorCodes,
  completeVideoJob,
} from "@acs/domain";
import { InternalJobCompleteSchema } from "@acs/schemas";
import { jsonError, jsonOk } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/internal/jobs/complete — mark a video job ready_for_review.
 *
 * For remotion browser path without outputAssetId, acknowledges WF-02 without
 * marking success (job stays rendering / awaiting browser export).
 */
export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();

  try {
    assertInternalServiceAuth(request);
    const body = InternalJobCompleteSchema.parse(await request.json());
    const supabase = createAdminClient();

    if (body.kind !== "video") {
      return jsonOk(
        {
          acknowledged: true,
          kind: body.kind,
          jobId: body.jobId,
        },
        body.correlationId ?? correlationId,
      );
    }

    const providerRequestId =
      body.providerRequestId && body.providerRequestId.length > 0
        ? body.providerRequestId
        : undefined;

    // Soft-ack when remotion is still awaiting browser MP4.
    if (!body.outputAssetId) {
      const { data: job } = await supabase
        .from("video_jobs")
        .select("id, production_mode, status")
        .eq("id", body.jobId)
        .maybeSingle();

      if (job?.production_mode === "remotion") {
        return jsonOk(
          {
            kind: "video" as const,
            completed: false,
            awaitingBrowser: true,
            claim: AWAITING_BROWSER_RENDER,
            jobId: body.jobId,
            message:
              "Remotion browser render pending — not marking ready_for_review without MP4.",
          },
          body.correlationId ?? correlationId,
        );
      }
    }

    try {
      const result = await completeVideoJob(supabase, {
        jobId: body.jobId,
        providerRequestId,
        outputAssetId: body.outputAssetId,
        actualCost: body.actualCost,
        correlationId: body.correlationId ?? correlationId,
      });

      return jsonOk(
        { ...result, kind: "video" as const, completed: true },
        body.correlationId ?? correlationId,
      );
    } catch (error) {
      if (
        error instanceof AppError &&
        error.code === ErrorCodes.VALIDATION_ERROR &&
        (error.details as { awaitingBrowser?: boolean } | undefined)
          ?.awaitingBrowser
      ) {
        return jsonOk(
          {
            kind: "video" as const,
            completed: false,
            awaitingBrowser: true,
            claim: AWAITING_BROWSER_RENDER,
            jobId: body.jobId,
            message: error.message,
          },
          body.correlationId ?? correlationId,
        );
      }
      throw error;
    }
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
