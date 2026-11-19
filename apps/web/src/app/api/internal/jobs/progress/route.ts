import { progressVideoJob } from "@acs/domain";
import { InternalJobProgressSchema } from "@acs/schemas";
import { jsonError, jsonOk } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/internal/jobs/progress — stage updates from n8n workers.
 */
export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();

  try {
    assertInternalServiceAuth(request);
    const body = InternalJobProgressSchema.parse(await request.json());
    const supabase = createAdminClient();

    if (body.kind && body.kind !== "video") {
      return jsonOk(
        {
          acknowledged: true,
          kind: body.kind,
          jobId: body.jobId,
          stage: body.stage,
          state: body.state,
        },
        body.correlationId ?? correlationId,
      );
    }

    const result = await progressVideoJob(supabase, {
      jobId: body.jobId,
      stage: body.stage,
      state: body.state,
      message: body.message,
      correlationId: body.correlationId ?? correlationId,
    });

    return jsonOk(
      { ...result, kind: "video" as const, stage: body.stage },
      body.correlationId ?? correlationId,
    );
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
