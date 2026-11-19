import { completeVideoJob } from "@acs/domain";
import { InternalJobCompleteSchema } from "@acs/schemas";
import { jsonError, jsonOk } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/internal/jobs/complete — mark a video job ready_for_review.
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

    const result = await completeVideoJob(supabase, {
      jobId: body.jobId,
      providerRequestId,
      outputAssetId: body.outputAssetId,
      actualCost: body.actualCost,
      correlationId: body.correlationId ?? correlationId,
    });

    return jsonOk(
      { ...result, kind: "video" as const },
      body.correlationId ?? correlationId,
    );
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
