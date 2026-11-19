import {
  AppError,
  ErrorCodes,
  appendMessage,
  createConceptWithDraftVersion,
  createDraftProject,
  createKitVersion,
  getLatestKit,
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
  /** When true and no project yet, parse assistant JSON and create a Draft Project. */
  createDraftFromAi: z.boolean().optional(),
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

    let projectId = body.projectId ?? run.project_id ?? null;
    let assistantMessage = body.assistantMessage;

    if (
      body.createDraftFromAi &&
      !projectId &&
      body.status === "completed" &&
      assistantMessage
    ) {
      let proposedName = "Untitled Project";
      let proposedObjective = assistantMessage.slice(0, 500);
      try {
        const parsed = JSON.parse(assistantMessage) as {
          reply?: string;
          proposedProject?: { name?: string; objective?: string };
        };
        proposedName =
          parsed.proposedProject?.name?.trim() || proposedName;
        proposedObjective =
          parsed.proposedProject?.objective?.trim() || proposedObjective;
        if (parsed.reply?.trim()) {
          assistantMessage = parsed.reply.trim();
        }
      } catch {
        // Non-JSON assistant text — still create a draft from the raw content.
      }

      const project = await createDraftProject(supabase, {
        ownerId: run.owner_id,
        input: {
          name: proposedName,
          objective: proposedObjective,
        },
        correlationId: body.correlationId ?? correlationId,
      });
      projectId = project.id;

      const kit = await getLatestKit(supabase, {
        projectId: project.id,
        ownerId: run.owner_id,
      });
      if (!kit) {
        await createKitVersion(supabase, {
          projectId: project.id,
          ownerId: run.owner_id,
          actorId: run.owner_id,
          inheritPrevious: false,
          input: {
            brandOrCreatorName: proposedName,
            tone: "clear and practical",
            audience: "general audience",
            languageDefault: "en",
            visualNotes: "Creative Kit seeded by agent planning",
            doSay: [],
            dontSay: [],
          },
          correlationId: body.correlationId ?? correlationId,
        });
      }

      const { concept } = await createConceptWithDraftVersion(supabase, {
        projectId: project.id,
        ownerId: run.owner_id,
        input: {
          title: `${proposedName} — first concept`,
          originalInput: proposedObjective,
          source: "agent",
          selectedForInitialLaunch: true,
        },
        correlationId: body.correlationId ?? correlationId,
      });

      void concept;
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

    if (projectId) {
      updates.project_id = projectId;
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
      message: body.summary ?? assistantMessage?.slice(0, 500) ?? null,
      error_code: body.errorCode ?? null,
    });

    let messageId: string | null = null;
    if (assistantMessage && run.conversation_id) {
      const message = await appendMessage(supabase, {
        conversationId: run.conversation_id,
        ownerId: run.owner_id,
        role: "assistant",
        content: assistantMessage,
        sourceSurface: "system",
      });
      messageId = message.id;
    }

    if (projectId && run.conversation_id) {
      await supabase
        .from("agent_conversations")
        .update({ project_id: projectId })
        .eq("id", run.conversation_id);
    }

    return jsonOk(
      {
        runId: body.runId,
        status: body.status,
        projectId,
        messageId,
      },
      body.correlationId ?? correlationId,
    );
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
