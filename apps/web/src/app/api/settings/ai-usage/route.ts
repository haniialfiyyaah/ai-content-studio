import { AppError, ErrorCodes, getAiUsage } from "@acs/domain";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/settings/ai-usage — managed allowance + recent usage events.
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

    const usage = await getAiUsage(supabase, user.id);
    return jsonOk(usage, correlationId);
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
