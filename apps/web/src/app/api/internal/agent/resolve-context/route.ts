import { AppError, ErrorCodes } from "@acs/domain";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const ResolveContextSchema = z.object({
  runId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  messageId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  correlationId: z.string().optional(),
  signedExecutionContext: z.string().optional(),
});

/**
 * POST /api/internal/agent/resolve-context
 * Resolves owner/conversation/project policy for a trusted agent request.
 */
export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();

  try {
    assertInternalServiceAuth(request);
    const body = ResolveContextSchema.parse(await request.json());
    const supabase = createAdminClient();

    let ownerId: string | null = null;
    let projectId = body.projectId ?? null;
    let conversationId = body.conversationId ?? null;
    let runStatus: string | null = null;

    if (body.runId) {
      const { data: run } = await supabase
        .from("workflow_runs")
        .select("id, owner_id, project_id, conversation_id, status, stage")
        .eq("id", body.runId)
        .maybeSingle();

      if (!run) {
        throw new AppError(ErrorCodes.NOT_FOUND, "Workflow run not found", 404);
      }

      ownerId = run.owner_id;
      projectId = run.project_id ?? projectId;
      conversationId = run.conversation_id ?? conversationId;
      runStatus = run.status;
    }

    if (conversationId) {
      const { data: conversation } = await supabase
        .from("agent_conversations")
        .select("id, owner_id, project_id")
        .eq("id", conversationId)
        .maybeSingle();

      if (!conversation) {
        throw new AppError(
          ErrorCodes.NOT_FOUND,
          "Conversation not found",
          404,
        );
      }

      if (ownerId && conversation.owner_id !== ownerId) {
        throw new AppError(
          ErrorCodes.FORBIDDEN,
          "Conversation does not match run owner",
          403,
        );
      }

      ownerId = conversation.owner_id;
      projectId = conversation.project_id ?? projectId;
    }

    if (!ownerId) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        "runId or conversationId is required to resolve context",
        400,
      );
    }

    let project: {
      id: string;
      status: string;
      settings_version: number;
      creative_context_version: number;
    } | null = null;

    if (projectId) {
      const { data } = await supabase
        .from("projects")
        .select("id, status, settings_version, creative_context_version")
        .eq("id", projectId)
        .eq("owner_id", ownerId)
        .maybeSingle();
      project = data;
    }

    return jsonOk(
      {
        ownerId,
        conversationId,
        projectId: project?.id ?? projectId,
        runId: body.runId ?? null,
        messageId: body.messageId ?? null,
        runStatus,
        projectStatus: project?.status ?? null,
        settingsVersion: project?.settings_version ?? null,
        creativeContextVersion: project?.creative_context_version ?? null,
        permissions: {
          canUseTools: true,
          canMutateProject: project?.status !== "archived",
          canSpend: false,
        },
        signedExecutionContext: body.signedExecutionContext ?? null,
      },
      body.correlationId ?? correlationId,
    );
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
