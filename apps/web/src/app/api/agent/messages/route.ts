import {
  AppError,
  ErrorCodes,
  appendMessage,
  createConversation,
  createDraftProject,
  detectActionableIntent,
  startPlanningRun,
} from "@acs/domain";
import { fixtureAiCompletion } from "@acs/integrations";
import { PostAgentMessageSchema } from "@acs/schemas";
import { jsonAccepted, jsonError, jsonOk } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/agent/messages
 * Persists a user message and optionally kicks off project_planning.
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

    const body = PostAgentMessageSchema.parse(await request.json());

    let conversationId = body.conversationId;
    let projectId = body.projectId ?? null;

    if (conversationId) {
      const { data: existing, error } = await supabase
        .from("agent_conversations")
        .select("id, project_id, owner_id")
        .eq("id", conversationId)
        .eq("owner_id", user.id)
        .maybeSingle();

      if (error || !existing) {
        throw new AppError(
          ErrorCodes.NOT_FOUND,
          "Conversation not found",
          404,
        );
      }
      projectId = existing.project_id ?? projectId;
    } else {
      const conversation = await createConversation(supabase, {
        ownerId: user.id,
        projectId,
        title: body.content.slice(0, 80),
      });
      conversationId = conversation.id;
    }

    const message = await appendMessage(supabase, {
      conversationId,
      ownerId: user.id,
      role: "user",
      content: body.content,
      sourceSurface: body.sourceSurface,
      sourceMessageId: body.sourceMessageId,
    });

    const actionable = detectActionableIntent(body.content);
    let runId: string | null = null;

    if (actionable && !projectId) {
      const run = await startPlanningRun(supabase, {
        ownerId: user.id,
        conversationId,
        messageId: message.id,
        projectId,
        correlationId,
      });
      runId = run.id;

      await supabase.from("outbox_events").insert({
        owner_id: user.id,
        event_type: "agent.project_planning.requested",
        payload: {
          runId: run.id,
          conversationId,
          messageId: message.id,
          correlationId,
        },
        aggregate_type: "workflow_run",
        aggregate_id: run.id,
        status: "pending",
      });

      const webhookBase = process.env.N8N_WEBHOOK_BASE_URL?.trim();

      if (webhookBase) {
        // Fire-and-forget — n8n owns orchestration when configured.
        void fetch(`${webhookBase}/agent-web`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-acs-service-token":
              process.env.ACS_INTERNAL_SERVICE_TOKEN ?? "",
          },
          body: JSON.stringify({
            runId: run.id,
            conversationId,
            messageId: message.id,
            correlationId,
          }),
        }).catch(() => {
          // Swallow network errors; outbox remains for retry workers.
        });

        return jsonAccepted(
          {
            conversationId,
            runId,
            projectId: null,
            messageId: message.id,
            assistantReply: null,
          },
          correlationId,
        );
      }

      // Synchronous fixture planning when n8n is not wired.
      const completion = fixtureAiCompletion({
        ownerId: user.id,
        purpose: "ideation",
        messages: [{ role: "user", content: body.content }],
        responseFormat: "json",
        correlationId,
      });

      let proposedName = "Untitled Project";
      let proposedObjective = body.content.slice(0, 500);
      let assistantReply = completion.content;
      try {
        const parsed = JSON.parse(completion.content) as {
          reply?: string;
          proposedProject?: { name?: string; objective?: string };
        };
        proposedName =
          parsed.proposedProject?.name?.trim() || proposedName;
        proposedObjective =
          parsed.proposedProject?.objective?.trim() || proposedObjective;
        assistantReply = parsed.reply?.trim() || completion.content;
      } catch {
        // Fixture JSON is expected; fall back to prompt-derived title.
      }

      const project = await createDraftProject(supabase, {
        ownerId: user.id,
        input: {
          name: proposedName,
          objective: proposedObjective,
        },
        correlationId,
      });
      projectId = project.id;

      await supabase
        .from("agent_conversations")
        .update({ project_id: project.id })
        .eq("id", conversationId);

      await appendMessage(supabase, {
        conversationId,
        ownerId: user.id,
        role: "assistant",
        content: assistantReply,
        sourceSurface: "system",
        modelMetadata: { fixture: true, model: completion.model },
      });

      await supabase
        .from("workflow_runs")
        .update({
          project_id: project.id,
          stage: "completed",
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", run.id);

      await supabase.from("workflow_run_events").insert({
        run_id: run.id,
        sequence: 1,
        stage: "completed",
        state: "completed",
        message: "Fixture planning completed",
      });

      return jsonOk(
        {
          conversationId,
          runId,
          projectId,
          messageId: message.id,
          assistantReply,
        },
        correlationId,
      );
    }

    return jsonOk(
      {
        conversationId,
        runId,
        projectId,
        messageId: message.id,
        assistantReply: null,
      },
      correlationId,
    );
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
