import {
  AppError,
  ErrorCodes,
  createRevisionFromApproved,
} from "@acs/domain";
import { CreateConceptRevisionInputSchema } from "@acs/schemas";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/concepts/[id]/versions — edit creates draft version N+1.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const correlationId = crypto.randomUUID();

  try {
    const { id: conceptId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new AppError(ErrorCodes.UNAUTHENTICATED, "Not signed in", 401);
    }

    const raw = await request.json().catch(() => ({}));
    const body = CreateConceptRevisionInputSchema.parse(raw ?? {});
    const result = await createRevisionFromApproved(supabase, {
      conceptId,
      ownerId: user.id,
      input: body,
      correlationId,
    });

    return jsonOk(result, correlationId);
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
