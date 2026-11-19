import {
  AppError,
  ErrorCodes,
  appendMessage,
} from "@acs/domain";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const RecordResultSchema = z.object({
  runId: z.string().uuid(),
  status: z.enum(["completed", "failed", "needs_input", "partial"]),
  assistantMessage: z.string().max(20000).optional(),
  projectId: z.string().uuid().optional(),
  errorCode: z.string().optional(),
  summary: z.string().max(4000).optional(),
  correlationId: z.string().uuid().optional(),
});

/**
 * POST /api/internal/agent/record-result
 * Finalizes a workflow run and optionally appends an assistant reply.
 */
export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();

  try {
    assertInternalServiceAuth(request);
    const body = RecordResultSchema.parse(await request.json());
    const supabase = createAdminClient();

    const { data: run, error: runError } = await supabase
      .from("workflow_runs")
      .select("id, owner_id, conversation_id, project_id")
      .eq("id", body.runId)
      .maybeSingle();

    if (runError || !run) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Workflow run not found", 404);
    }

    const updates: Record<string, unknown> = {
      status: body.status,
      stage: body.status === "completed" ? "completed" : body.status,
      completed_at:
        body.status === "completed" || body.status === "failed"
          ? new Date().toISOString()
          : null,
      failure_category: body.errorCode ?? null,
    };

    if (body.projectId) {
      updates.project_id = body.projectId;
    }

    await supabase.from("workflow_runs").update(updates).eq("id", body.runId);

    const { data: lastEvent } = await supabase
      .from("workflow_run_events")
      .select("sequence")
      .eq("run_id", body.runId)
      .order("sequence", { ascending: false })
      .limit(1)
      .maybeSingle();

    await supabase.from("workflow_run_events").insert({
      run_id: body.runId,
      sequence: (lastEvent?.sequence ?? 0) + 1,
      stage: body.status,
      state: body.status,
      message: body.summary ?? body.assistantMessage?.slice(0, 500) ?? null,
      error_code: body.errorCode ?? null,
    });

    let messageId: string | null = null;
    if (body.assistantMessage && run.conversation_id) {
      const message = await appendMessage(supabase, {
        conversationId: run.conversation_id,
        ownerId: run.owner_id,
        role: "assistant",
        content: body.assistantMessage,
        sourceSurface: "system",
      });
      messageId = message.id;
    }

    if (body.projectId && run.conversation_id) {
      await supabase
        .from("agent_conversations")
        .update({ project_id: body.projectId })
        .eq("id", run.conversation_id);
    }

    return jsonOk(
      {
        runId: body.runId,
        status: body.status,
        projectId: body.projectId ?? run.project_id,
        messageId,
      },
      body.correlationId ?? correlationId,
    );
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
