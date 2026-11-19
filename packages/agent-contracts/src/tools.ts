import { z } from "zod";

/** Allowlisted agent tools (TDD §6). n8n may only invoke these via internal API. */
export const AGENT_TOOL_NAMES = [
  "get_project_context",
  "search_project_content",
  "propose_project",
  "create_draft_project",
  "propose_concepts",
  "save_concept_drafts",
  "revise_concept",
  "propose_visual_plan",
  "research_products",
  "research_trends",
  "get_workflow_status",
  "propose_automation_changes",
  "request_project_activation",
  "request_paid_generation",
  "request_publication",
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

export const AgentToolNameSchema = z.enum(AGENT_TOOL_NAMES);

export const CreateDraftProjectToolInputSchema = z.object({
  name: z.string().min(1).max(200),
  objective: z.string().max(4000).optional(),
  description: z.string().max(4000).optional(),
  contentMode: z.enum(["independent", "series"]).default("independent"),
  timezone: z.string().default("UTC"),
});

export const ProposeConceptsToolInputSchema = z.object({
  projectId: z.string().uuid(),
  concepts: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        hook: z.string().optional(),
        script: z.string().optional(),
        selectedForInitialLaunch: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(20),
});
