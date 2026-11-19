import {
  appendMessage,
  createConceptWithDraftVersion,
  createDraftProject,
  createKitVersion,
  getLatestKit,
  prepareOpenAiExecution,
} from "@acs/domain";
import { executeOpenAi } from "@acs/integrations";
import type { WorkflowRunStage } from "@acs/schemas";
import type { createClient } from "@/lib/supabase/server";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

export interface LocalPlanningParams {
  ownerId: string;
  runId: string;
  conversationId: string;
  content: string;
  correlationId: string;
}

/**
 * In-app project planning, used while no n8n webhook is configured. Runs after
 * the response is sent and records a workflow_run_events row before each step,
 * so the creator sees the same real progress the n8n path reports.
 */
export async function runLocalPlanning(
  supabase: ServerSupabase,
  params: LocalPlanningParams,
): Promise<void> {
  const { ownerId, runId, conversationId, content, correlationId } = params;
  let sequence = 0;

  async function record(
    stage: WorkflowRunStage,
    message: string,
    state: "running" | "completed" | "failed" = "running",
  ): Promise<void> {
    sequence += 1;
    await supabase.from("workflow_run_events").insert({
      run_id: runId,
      sequence,
      stage,
      state,
      message,
    });
    await supabase
      .from("workflow_runs")
      .update({ stage, status: state === "running" ? "running" : state })
      .eq("id", runId);
  }

  try {
    await record("interpreting", "Reading your request");

    await record("planning", "Drafting a Project plan");
    const prepared = await prepareOpenAiExecution(supabase, ownerId);
    const completion = await executeOpenAi(
      {
        ownerId,
        purpose: "ideation",
        messages: [{ role: "user", content }],
        responseFormat: "json",
        correlationId,
        workflowRunId: runId,
      },
      {
        fixtureMode: prepared.fixtureMode,
        managedApiKey: prepared.managedApiKey,
        byokApiKey: prepared.byokApiKey,
        mode: prepared.mode,
      },
    );

    let proposedName = "Untitled Project";
    let proposedObjective = content.slice(0, 500);
    let assistantReply = completion.content;
    try {
      const parsed = JSON.parse(completion.content) as {
        reply?: string;
        proposedProject?: { name?: string; objective?: string };
      };
      proposedName = parsed.proposedProject?.name?.trim() || proposedName;
      proposedObjective =
        parsed.proposedProject?.objective?.trim() || proposedObjective;
      assistantReply = parsed.reply?.trim() || completion.content;
    } catch {
      // Fixture JSON is expected; fall back to prompt-derived title.
    }

    await record("persisting", `Creating the Draft Project “${proposedName}”`);
    const project = await createDraftProject(supabase, {
      ownerId,
      input: { name: proposedName, objective: proposedObjective },
      correlationId,
    });
    // Link early so the thread can offer "Open Project" before the run finishes.
    await supabase
      .from("workflow_runs")
      .update({ project_id: project.id })
      .eq("id", runId);

    await record("generating", "Setting up the Creative Kit and first concept");
    await seedKitAndConcept(supabase, {
      ownerId,
      projectId: project.id,
      proposedName,
      proposedObjective,
      fixture: completion.fixture,
      correlationId,
    });

    await record("finalizing", "Linking this conversation to the Project");
    await supabase
      .from("agent_conversations")
      .update({ project_id: project.id })
      .eq("id", conversationId);

    await appendMessage(supabase, {
      conversationId,
      ownerId,
      role: "assistant",
      content: assistantReply,
      sourceSurface: "system",
      modelMetadata: {
        fixture: completion.fixture,
        model: completion.model,
        mode: completion.mode,
      },
    });

    await supabase
      .from("workflow_runs")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", runId);
    await record(
      "completed",
      completion.fixture
        ? "Draft Project ready (fixture planning, not a live model)"
        : "Draft Project ready",
      "completed",
    );
  } catch (error) {
    console.error("[agent] local planning failed", {
      runId,
      correlationId,
      error: error instanceof Error ? error.message : String(error),
    });
    await record(
      "failed",
      "Planning stopped before the Project was ready. Send the message again to retry.",
      "failed",
    ).catch(() => {
      // The run row may be unreachable; nothing more to report.
    });
  }
}

/** Seeds a first Creative Kit and a launch-selected concept for a new Draft Project. */
async function seedKitAndConcept(
  supabase: ServerSupabase,
  params: {
    ownerId: string;
    projectId: string;
    proposedName: string;
    proposedObjective: string;
    fixture: boolean;
    correlationId: string;
  },
): Promise<void> {
  const { ownerId, projectId, proposedName, proposedObjective, fixture, correlationId } =
    params;

  const existingKit = await getLatestKit(supabase, { projectId, ownerId });
  if (!existingKit) {
    await createKitVersion(supabase, {
      projectId,
      ownerId,
      actorId: ownerId,
      inheritPrevious: false,
      input: {
        brandOrCreatorName: proposedName,
        tone: "clear and practical",
        audience: "general audience",
        languageDefault: "en",
        visualNotes: "Fixture Creative Kit seeded by agent planning",
        doSay: [],
        dontSay: [],
      },
      correlationId,
    });
  }

  const { data: selectedLaunch } = await supabase
    .from("concepts")
    .select("id")
    .eq("project_id", projectId)
    .eq("owner_id", ownerId)
    .eq("selected_for_initial_launch", true)
    .limit(1)
    .maybeSingle();

  if (selectedLaunch) return;

  const { concept } = await createConceptWithDraftVersion(supabase, {
    projectId,
    ownerId,
    input: {
      title: `${proposedName} — first concept`,
      originalInput: proposedObjective,
      source: "agent",
      hook: proposedObjective.slice(0, 180),
      content: {
        hook: proposedObjective.slice(0, 180),
        script: fixture
          ? `Fixture draft for “${proposedName}”.\n\n${proposedObjective}\n\nThis script is a planning stub so Content Detail is reviewable. It is not a live model write.`
          : proposedObjective,
        locale: "en",
        notes: fixture
          ? "Fixture-generated planning draft. Not a live OpenAI result."
          : undefined,
        scenes: [
          {
            id: "scene-1",
            title: "Open",
            narration: proposedObjective.slice(0, 240),
            visualDirection: "Wide establishing shot",
            durationMs: 3000,
          },
          {
            id: "scene-2",
            title: "Point",
            narration: "State the main idea in one sentence.",
            visualDirection: "Medium shot with caption",
            durationMs: 3000,
          },
        ],
      },
      visualPlan: {
        productionMode: "remotion",
        aspectRatio: "16:9",
        captionStyle: "lower-third",
        scenes: [
          {
            sceneId: "scene-1",
            shotType: "wide",
            motion: "slow push",
            assets: [],
            caption: "Open",
          },
          {
            sceneId: "scene-2",
            shotType: "medium",
            motion: "hold",
            assets: [],
            caption: "Point",
          },
        ],
      },
      publishingPack: {
        title: proposedName,
        description: proposedObjective.slice(0, 300),
        tags: ["draft"],
        locale: "en",
        platforms: {},
      },
    },
    correlationId,
  });

  await supabase
    .from("concepts")
    .update({ selected_for_initial_launch: true })
    .eq("id", concept.id)
    .eq("owner_id", ownerId);
}
