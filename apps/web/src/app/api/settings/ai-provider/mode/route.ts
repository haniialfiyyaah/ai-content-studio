import { AppError, ErrorCodes, setMode } from "@acs/domain";
import { SetAiModeSchema } from "@acs/schemas";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";

/**
 * PUT /api/settings/ai-provider/mode — switch managed ↔ BYOK (no silent fallback).
 */
export async function PUT(request: Request) {
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

    const body = SetAiModeSchema.parse(await request.json());
    const preferences = await setMode(supabase, {
      ownerId: user.id,
      input: body,
    });

    return jsonOk({ preferences }, correlationId);
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
