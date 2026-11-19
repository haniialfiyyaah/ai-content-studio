import { AppError, ErrorCodes } from "@acs/domain";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const RecordErrorSchema = z.object({
  workflowId: z.string().max(200).optional(),
  executionId: z.string().max(200).optional(),
  runId: z.string().uuid().optional(),
  correlationId: z.string().optional(),
  category: z.string().max(64).optional(),
  message: z.string().max(4000).optional(),
  sanitized: z.boolean().optional(),
});

/**
 * POST /api/internal/workflows/record-error
 * Records a sanitized n8n / worker incident against a workflow run when present.
 */
export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();

  try {
    assertInternalServiceAuth(request);
    const body = RecordErrorSchema.parse(await request.json());
    const supabase = createAdminClient();

    let eventId: string | null = null;
    let ownerId: string | null = null;

    if (body.runId) {
      const { data: run } = await supabase
        .from("workflow_runs")
        .select("id, owner_id")
        .eq("id", body.runId)
        .maybeSingle();

      if (!run) {
        throw new AppError(ErrorCodes.NOT_FOUND, "Workflow run not found", 404);
      }

      ownerId = run.owner_id;

      await supabase
        .from("workflow_runs")
        .update({
          status: "failed",
          stage: "failed",
          failure_category: body.category ?? "platform",
          completed_at: new Date().toISOString(),
        })
        .eq("id", body.runId);

      const { data: lastEvent } = await supabase
        .from("workflow_run_events")
        .select("sequence")
        .eq("run_id", body.runId)
        .order("sequence", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: event } = await supabase
        .from("workflow_run_events")
        .insert({
          run_id: body.runId,
          sequence: (lastEvent?.sequence ?? 0) + 1,
          stage: "failed",
          state: "failed",
          message: body.message?.slice(0, 500) ?? "Workflow error recorded",
          error_code: body.category ?? null,
        })
        .select("id")
        .single();

      eventId = event?.id ?? null;
    }

    await supabase.from("audit_events").insert({
      owner_id: ownerId,
      actor_type: "service",
      actor_id: null,
      action: "workflow.error_recorded",
      target_type: body.runId ? "workflow_run" : "workflow",
      target_id: body.runId ?? null,
      after_summary: {
        workflowId: body.workflowId ?? null,
        executionId: body.executionId ?? null,
        category: body.category ?? null,
        message: body.message?.slice(0, 500) ?? null,
        sanitized: body.sanitized ?? true,
      },
      correlation_id: body.correlationId ?? correlationId,
      source_surface: "system",
    });

    return jsonOk(
      {
        recorded: true,
        runId: body.runId ?? null,
        eventId,
        workflowId: body.workflowId ?? null,
        executionId: body.executionId ?? null,
      },
      body.correlationId ?? correlationId,
    );
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
