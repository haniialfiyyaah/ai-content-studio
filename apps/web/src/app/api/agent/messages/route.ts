import { after } from "next/server";
import {
  AppError,
  ErrorCodes,
  appendMessage,
  createConversation,
  detectActionableIntent,
  startPlanningRun,
} from "@acs/domain";
import { PostAgentMessageSchema } from "@acs/schemas";
import { runLocalPlanning } from "@/lib/agent/local-planning";
import { jsonAccepted, jsonError, jsonOk } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/agent/messages
 * Persists a user message and optionally kicks off project_planning.
 * Planning always answers 202 with a runId; clients follow progress on
 * GET /api/agent/runs/{runId}, whether n8n or the in-app planner runs it.
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

    if (actionable && !projectId) {
      const run = await startPlanningRun(supabase, {
        ownerId: user.id,
        conversationId,
        messageId: message.id,
        projectId,
        correlationId,
      });

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
            ownerId: user.id,
          }),
        }).catch(() => {
          // Swallow network errors; outbox remains for retry workers.
        });
      } else {
        // In-app planning through the same AI Provider Gateway (managed/BYOK/fixture),
        // run after the response so the client can show each recorded step.
        const planningConversationId = conversationId;
        after(() =>
          runLocalPlanning(supabase, {
            ownerId: user.id,
            runId: run.id,
            conversationId: planningConversationId,
            content: body.content,
            correlationId,
          }),
        );
      }

      return jsonAccepted(
        {
          conversationId,
          runId: run.id,
          projectId: null,
          messageId: message.id,
          assistantReply: null,
        },
        correlationId,
      );
    }

    return jsonOk(
      {
        conversationId,
        runId: null,
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
