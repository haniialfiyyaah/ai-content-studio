import { AppError, ErrorCodes } from "@acs/domain";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/agent/runs/[id]
 * Owner-scoped status for a planning run started by n8n or the local planner.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const correlationId = crypto.randomUUID();

  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new AppError(ErrorCodes.UNAUTHENTICATED, "Not signed in", 401);
    }

    const { data: run, error } = await supabase
      .from("workflow_runs")
      .select("id, status, stage, project_id")
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (error || !run) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Planning run not found", 404);
    }

    return jsonOk(
      {
        runId: run.id,
        status: run.status,
        stage: run.stage,
        projectId: run.project_id,
      },
      correlationId,
    );
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
