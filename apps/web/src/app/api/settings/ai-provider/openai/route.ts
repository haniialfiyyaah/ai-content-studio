import {
  AppError,
  ErrorCodes,
  connectOpenAiKey,
  disconnect,
} from "@acs/domain";
import { ConnectOpenAiKeySchema } from "@acs/schemas";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/settings/ai-provider/openai — encrypt + store BYOK key (pending).
 */
export async function POST(request: Request) {
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

    const body = ConnectOpenAiKeySchema.parse(await request.json());
    const connection = await connectOpenAiKey(supabase, {
      ownerId: user.id,
      input: body,
    });

    return jsonOk({ connection }, correlationId);
  } catch (error) {
    return jsonError(error, correlationId);
  }
}

/**
 * DELETE /api/settings/ai-provider/openai — disconnect BYOK and clear secret.
 */
export async function DELETE() {
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

    const result = await disconnect(supabase, user.id);
    return jsonOk(result, correlationId);
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
