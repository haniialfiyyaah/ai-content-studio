import {
  AppError,
  ErrorCodes,
  createDraftProject,
  mapProjectRow,
} from "@acs/domain";
import { CreateProjectInputSchema } from "@acs/schemas";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/projects — list the signed-in owner's projects (newest first).
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

    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, error.message, 500);
    }

    // PostgREST returns snake_case rows matching mapProjectRow's input shape.
    const projects = (data ?? []).map((row) =>
      mapProjectRow(row as never),
    );

    return jsonOk({ projects }, correlationId);
  } catch (error) {
    return jsonError(error, correlationId);
  }
}

/**
 * POST /api/projects — create a draft project for the signed-in owner.
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

    const body = CreateProjectInputSchema.parse(await request.json());
    const project = await createDraftProject(supabase, {
      ownerId: user.id,
      input: body,
      correlationId,
    });

    return jsonOk({ project }, correlationId);
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
