import {
  AppError,
  ErrorCodes,
  createKitVersion,
  getLatestKit,
} from "@acs/domain";
import { CreateCreativeKitInputSchema } from "@acs/schemas";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/projects/[id]/creative-kit — latest Creative Kit version (or null).
 */
export async function GET(
  _request: Request,
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

    const kit = await getLatestKit(supabase, {
      projectId,
      ownerId: user.id,
    });

    return jsonOk({ kit }, correlationId);
  } catch (error) {
    return jsonError(error, correlationId);
  }
}

/**
 * POST /api/projects/[id]/creative-kit — create next kit version.
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

    const raw = await request.json().catch(() => ({}));
    const body = CreateCreativeKitInputSchema.parse(raw ?? {});
    const kit = await createKitVersion(supabase, {
      projectId,
      ownerId: user.id,
      actorId: user.id,
      input: body,
      correlationId,
    });

    return jsonOk({ kit }, correlationId);
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
