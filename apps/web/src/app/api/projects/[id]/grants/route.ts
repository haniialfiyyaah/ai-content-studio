import { AppError, ErrorCodes, createGrant } from "@acs/domain";
import { CreateGrantInputSchema } from "@acs/schemas";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/projects/[id]/grants
 * Explicit spend / destination / activation-adjacent authorization grants.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const correlationId = crypto.randomUUID();

  try {
    const { id: projectId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new AppError(ErrorCodes.UNAUTHENTICATED, "Not signed in", 401);
    }

    const body = CreateGrantInputSchema.parse(await request.json());
    const grant = await createGrant(supabase, {
      projectId,
      ownerId: user.id,
      actorId: user.id,
      input: body,
      correlationId,
    });

    return jsonOk({ grant }, correlationId);
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
