import { AppError, ErrorCodes, requestRender } from "@acs/domain";
import { RequestRenderInputSchema } from "@acs/schemas";
import { jsonAccepted, jsonError } from "@/lib/api/response";
import { dispatchVideoProduction } from "@/lib/n8n/dispatch-video-production";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/concept-versions/[id]/render — queue paid video production.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const correlationId = crypto.randomUUID();

  try {
    const { id: conceptVersionId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new AppError(ErrorCodes.UNAUTHENTICATED, "Not signed in", 401);
    }

    const body = RequestRenderInputSchema.parse(await request.json());
    const result = await requestRender(supabase, {
      ownerId: user.id,
      conceptVersionId,
      productionMode: body.productionMode,
      consentId: body.consentId,
      estimatedCost: body.estimatedCost,
      idempotencyKey: body.idempotencyKey,
      requestedProviderModel: body.requestedProviderModel,
      correlationId,
    });

    // Job row is durable; wake WF-02 now (WF-02S sweeps it if this is lost).
    if (!result.reused) {
      dispatchVideoProduction({
        jobId: result.job.id,
        projectId: result.job.projectId,
        conceptVersionId: result.job.conceptVersionId,
        productionMode: result.job.productionMode,
        consentId: result.job.consentId,
        idempotencyKey: result.job.idempotencyKey,
        correlationId,
      });
    }

    return jsonAccepted(result, correlationId);
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
