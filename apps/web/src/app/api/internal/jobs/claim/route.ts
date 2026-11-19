import { claimVideoJob } from "@acs/domain";
import { InternalJobClaimSchema } from "@acs/schemas";
import { jsonError, jsonOk } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/internal/jobs/claim — worker claim for video (and future kinds).
 */
export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();

  try {
    assertInternalServiceAuth(request);
    const body = InternalJobClaimSchema.parse(await request.json());
    const supabase = createAdminClient();

    if (body.kind !== "video") {
      // Publishing/agent claim hooks land here later; keep contract stable.
      return jsonOk(
        {
          claim: "not_claimable" as const,
          kind: body.kind,
          jobId: body.jobId,
        },
        body.correlationId ?? correlationId,
      );
    }

    const result = await claimVideoJob(supabase, {
      jobId: body.jobId,
      claimedBy: body.claimedBy ?? "n8n",
      correlationId: body.correlationId ?? correlationId,
    });

    return jsonOk(
      {
        ...result,
        kind: "video" as const,
      },
      body.correlationId ?? correlationId,
    );
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
