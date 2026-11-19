import { z } from "zod";
import { SourceSurfaceSchema } from "./enums";

export const AgentMessageRoleSchema = z.enum([
  "user",
  "assistant",
  "system",
  "tool",
]);
export type AgentMessageRole = z.infer<typeof AgentMessageRoleSchema>;

export const PostAgentMessageSchema = z.object({
  conversationId: z.string().uuid().optional(),
  content: z.string().min(1).max(20000),
  projectId: z.string().uuid().optional(),
  sourceSurface: SourceSurfaceSchema.default("web"),
  sourceMessageId: z.string().max(200).optional(),
});
export type PostAgentMessage = z.infer<typeof PostAgentMessageSchema>;

export const WorkflowRunStageSchema = z.enum([
  "queued",
  "interpreting",
  "researching",
  "planning",
  "generating",
  "validating",
  "persisting",
  "finalizing",
  "needs_input",
  "completed",
  "failed",
  "held",
]);
export type WorkflowRunStage = z.infer<typeof WorkflowRunStageSchema>;
