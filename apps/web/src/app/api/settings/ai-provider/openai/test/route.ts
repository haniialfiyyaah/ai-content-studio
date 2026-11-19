import { AppError, ErrorCodes, testConnection } from "@acs/domain";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/settings/ai-provider/openai/test — verify stored BYOK key.
 */
export async function POST() {
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

    const result = await testConnection(supabase, user.id);
    return jsonOk(result, correlationId);
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
