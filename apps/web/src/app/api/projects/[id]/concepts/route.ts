import {
  AppError,
  ErrorCodes,
  createConceptWithDraftVersion,
  mapConceptRow,
} from "@acs/domain";
import { CreateConceptInputSchema } from "@acs/schemas";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/projects/[id]/concepts — list concepts for an owned project.
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

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (projectError || !project) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Project not found", 404);
    }

    const { data, error } = await supabase
      .from("concepts")
      .select("*")
      .eq("project_id", projectId)
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, error.message, 500);
    }

    const concepts = (data ?? []).map((row) => mapConceptRow(row as never));
    return jsonOk({ concepts }, correlationId);
  } catch (error) {
    return jsonError(error, correlationId);
  }
}

/**
 * POST /api/projects/[id]/concepts — create concept + draft version 1.
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

    const body = CreateConceptInputSchema.parse(await request.json());
    const result = await createConceptWithDraftVersion(supabase, {
      projectId,
      ownerId: user.id,
      input: body,
      correlationId,
    });

    return jsonOk(result, correlationId);
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
