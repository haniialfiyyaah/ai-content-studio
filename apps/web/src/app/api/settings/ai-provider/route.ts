import { AppError, ErrorCodes, getPreferences } from "@acs/domain";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/settings/ai-provider — preferences + public connection metadata.
 */
export async function GET() {
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

    const result = await getPreferences(supabase, user.id);
    return jsonOk(result, correlationId);
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
