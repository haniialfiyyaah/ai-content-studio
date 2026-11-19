import { failVideoJob } from "@acs/domain";
import { InternalJobFailSchema } from "@acs/schemas";
import { jsonError, jsonOk } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/internal/jobs/fail — mark a video job failed.
 */
export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();

  try {
    assertInternalServiceAuth(request);
    const body = InternalJobFailSchema.parse(await request.json());
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

    const result = await failVideoJob(supabase, {
      jobId: body.jobId,
      category: body.category,
      message: body.message,
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
