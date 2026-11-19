import { AppError, ErrorCodes } from "@acs/domain";
import { WorkflowRunStageSchema } from "@acs/schemas";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const RecordProgressSchema = z.object({
  runId: z.string().uuid(),
  stage: WorkflowRunStageSchema,
  state: z.string().min(1).max(64).default("running"),
  message: z.string().max(2000).optional(),
  availableSectionKeys: z.array(z.string()).optional(),
  correlationId: z.string().uuid().optional(),
});

/**
 * POST /api/internal/agent/record-progress
 * Appends a workflow_run_events row and updates the parent run stage.
 */
export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();

  try {
    assertInternalServiceAuth(request);
    const body = RecordProgressSchema.parse(await request.json());
    const supabase = createAdminClient();

    const { data: run, error: runError } = await supabase
      .from("workflow_runs")
      .select("id, status")
      .eq("id", body.runId)
      .maybeSingle();

    if (runError || !run) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Workflow run not found", 404);
    }

    const { data: lastEvent } = await supabase
      .from("workflow_run_events")
      .select("sequence")
      .eq("run_id", body.runId)
      .order("sequence", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextSequence = (lastEvent?.sequence ?? 0) + 1;

    await supabase.from("workflow_run_events").insert({
      run_id: body.runId,
      sequence: nextSequence,
      stage: body.stage,
      state: body.state,
      message: body.message ?? null,
      available_section_keys: body.availableSectionKeys ?? [],
    });

    const status =
      body.stage === "needs_input"
        ? "needs_input"
        : body.stage === "failed"
          ? "failed"
          : body.stage === "completed"
            ? "completed"
            : "running";

    await supabase
      .from("workflow_runs")
      .update({
        stage: body.stage,
        status,
      })
      .eq("id", body.runId);

    return jsonOk(
      { runId: body.runId, sequence: nextSequence, stage: body.stage },
      body.correlationId ?? correlationId,
    );
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
