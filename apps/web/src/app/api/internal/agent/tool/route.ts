import { AppError, ErrorCodes } from "@acs/domain";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const AgentToolSchema = z.object({
  runId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  correlationId: z.string().optional(),
  toolName: z.string().min(1).max(120),
  args: z.record(z.unknown()).optional(),
});

const ALLOWLISTED_TOOLS = new Set([
  "get_project",
  "list_concepts",
  "create_concept_draft",
  "get_creative_kit",
  "noop",
]);

/**
 * POST /api/internal/agent/tool
 * Executes one allowlisted, scoped domain tool (stub / read-mostly).
 */
export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();

  try {
    assertInternalServiceAuth(request);
    const body = AgentToolSchema.parse(await request.json());
    const supabase = createAdminClient();

    if (!ALLOWLISTED_TOOLS.has(body.toolName)) {
      throw new AppError(
        ErrorCodes.FORBIDDEN,
        `Tool not allowlisted: ${body.toolName}`,
        403,
      );
    }

    let ownerId: string | null = null;
    if (body.runId) {
      const { data: run } = await supabase
        .from("workflow_runs")
        .select("owner_id, project_id")
        .eq("id", body.runId)
        .maybeSingle();
      ownerId = run?.owner_id ?? null;
    }

    if (!ownerId && body.conversationId) {
      const { data: conversation } = await supabase
        .from("agent_conversations")
        .select("owner_id")
        .eq("id", body.conversationId)
        .maybeSingle();
      ownerId = conversation?.owner_id ?? null;
    }

    if (body.toolName === "noop") {
      return jsonOk(
        {
          toolName: body.toolName,
          ok: true,
          result: { acknowledged: true },
        },
        body.correlationId ?? correlationId,
      );
    }

    if (!body.projectId) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        "projectId is required for this tool",
        400,
      );
    }

    const { data: project } = await supabase
      .from("projects")
      .select("id, owner_id, name, status, objective, settings_version")
      .eq("id", body.projectId)
      .maybeSingle();

    if (!project || (ownerId && project.owner_id !== ownerId)) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Project not found", 404);
    }

    if (body.toolName === "get_project") {
      return jsonOk(
        {
          toolName: body.toolName,
          ok: true,
          result: {
            id: project.id,
            name: project.name,
            status: project.status,
            objective: project.objective,
            settingsVersion: project.settings_version,
          },
        },
        body.correlationId ?? correlationId,
      );
    }

    if (body.toolName === "list_concepts") {
      const { data: concepts } = await supabase
        .from("concepts")
        .select(
          "id, title, selected_for_initial_launch, working_version_id, latest_approved_version_id",
        )
        .eq("project_id", body.projectId)
        .eq("owner_id", project.owner_id)
        .order("created_at", { ascending: false })
        .limit(50);

      return jsonOk(
        {
          toolName: body.toolName,
          ok: true,
          result: { concepts: concepts ?? [] },
        },
        body.correlationId ?? correlationId,
      );
    }

    if (body.toolName === "get_creative_kit") {
      const { data: kit } = await supabase
        .from("project_brand_kits")
        .select("*")
        .eq("project_id", body.projectId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

      return jsonOk(
        {
          toolName: body.toolName,
          ok: true,
          result: { kit: kit ?? null },
        },
        body.correlationId ?? correlationId,
      );
    }

    // create_concept_draft — stub acknowledges without writing until tool args harden.
    return jsonOk(
      {
        toolName: body.toolName,
        ok: true,
        result: {
          stub: true,
          message:
            "create_concept_draft stub — use POST /api/projects/:id/concepts from the web surface",
          args: body.args ?? {},
        },
      },
      body.correlationId ?? correlationId,
    );
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
