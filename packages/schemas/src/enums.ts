import { z } from "zod";

export const ProjectStatusSchema = z.enum([
  "draft",
  "active",
  "paused",
  "stopped",
  "archived",
]);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const ContentModeSchema = z.enum(["independent", "series"]);
export type ContentMode = z.infer<typeof ContentModeSchema>;

export const ProductionModeSchema = z.enum(["remotion", "fal", "hybrid"]);
export type ProductionMode = z.infer<typeof ProductionModeSchema>;

export const ConceptReviewStatusSchema = z.enum([
  "draft",
  "pending_review",
  "approved",
]);
export type ConceptReviewStatus = z.infer<typeof ConceptReviewStatusSchema>;

export const VideoJobStatusSchema = z.enum([
  "queued",
  "preparing",
  "generating",
  "rendering",
  "validating",
  "ready_for_review",
  "blocked",
  "failed",
  "cancel_requested",
  "cancelled",
  "reconciling",
]);
export type VideoJobStatus = z.infer<typeof VideoJobStatusSchema>;

export const PublishingJobStatusSchema = z.enum([
  "draft_intent",
  "blocked",
  "scheduled",
  "held",
  "publishing",
  "published",
  "failed",
  "cancel_requested",
  "cancelled",
  "reconciling",
]);
export type PublishingJobStatus = z.infer<typeof PublishingJobStatusSchema>;

export const AuthorizationScopeSchema = z.enum([
  "activate_project",
  "auto_approve_concept",
  "auto_approve_video",
  "produce_paid_media",
  "publish_destination",
  "spend_limit",
]);
export type AuthorizationScope = z.infer<typeof AuthorizationScopeSchema>;

export const OpenAiModeSchema = z.enum(["managed", "byok"]);
export type OpenAiMode = z.infer<typeof OpenAiModeSchema>;

export const AiProviderConnectionStatusSchema = z.enum([
  "pending",
  "connected",
  "invalid",
  "revoked",
  "disconnected",
]);
export type AiProviderConnectionStatus = z.infer<
  typeof AiProviderConnectionStatusSchema
>;

export const AutomationRuleKindSchema = z.enum([
  "ideation",
  "publishing_slots",
  "notifications",
  "analytics",
  "research",
]);
export type AutomationRuleKind = z.infer<typeof AutomationRuleKindSchema>;

export const SourceSurfaceSchema = z.enum([
  "web",
  "telegram",
  "system",
  "tool",
]);
export type SourceSurface = z.infer<typeof SourceSurfaceSchema>;
