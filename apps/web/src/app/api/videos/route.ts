import { AppError, ErrorCodes, listVideoAttempts } from "@acs/domain";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/videos — list video attempts for the signed-in owner.
 */
export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new AppError(ErrorCodes.UNAUTHENTICATED, "Not signed in", 401);
    }

    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId") ?? undefined;

    const items = await listVideoAttempts(supabase, {
      ownerId: user.id,
      projectId,
    });

    return jsonOk({ items }, correlationId);
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
