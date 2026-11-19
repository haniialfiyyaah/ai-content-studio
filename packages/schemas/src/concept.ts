import { z } from "zod";
import { ConceptReviewStatusSchema } from "./enums";

export const ConceptContentSchema = z.object({
  hook: z.string().optional(),
  script: z.string().optional(),
  scenes: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        narration: z.string().optional(),
        visualDirection: z.string().optional(),
        durationMs: z.number().int().positive().optional(),
      }),
    )
    .default([]),
  locale: z.enum(["id", "en"]).default("en"),
  notes: z.string().optional(),
});
export type ConceptContent = z.infer<typeof ConceptContentSchema>;

export const VisualPlanSchema = z.object({
  productionMode: z.enum(["remotion", "fal", "hybrid"]).optional(),
  aspectRatio: z.string().default("9:16"),
  scenes: z
    .array(
      z.object({
        sceneId: z.string(),
        shotType: z.string().optional(),
        motion: z.string().optional(),
        assets: z.array(z.string()).default([]),
        caption: z.string().optional(),
      }),
    )
    .default([]),
  narrationVoiceId: z.string().optional(),
  captionStyle: z.string().optional(),
});
export type VisualPlan = z.infer<typeof VisualPlanSchema>;

export const PublishingPackSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
  locale: z.enum(["id", "en"]).default("en"),
  platforms: z.record(z.unknown()).default({}),
});
export type PublishingPack = z.infer<typeof PublishingPackSchema>;

export const ConceptVersionSchema = z.object({
  id: z.string().uuid(),
  conceptId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  reviewStatus: ConceptReviewStatusSchema,
  content: ConceptContentSchema,
  brandKitSnapshot: z.unknown().nullable(),
  visualPlan: VisualPlanSchema.nullable(),
  publishingPack: PublishingPackSchema.nullable(),
  approvedAt: z.string().datetime().nullable(),
  approvalRevokedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type ConceptVersion = z.infer<typeof ConceptVersionSchema>;

export const ConceptSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  ownerId: z.string().uuid(),
  title: z.string(),
  originalInput: z.string().nullable(),
  source: z.string(),
  selectedForInitialLaunch: z.boolean(),
  workingVersionId: z.string().uuid().nullable(),
  latestApprovedVersionId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Concept = z.infer<typeof ConceptSchema>;

export const ConceptSourceSchema = z.enum([
  "web",
  "telegram",
  "agent",
  "schedule",
  "import",
]);
export type ConceptSource = z.infer<typeof ConceptSourceSchema>;

/** Body for POST /api/projects/:id/concepts */
export const CreateConceptInputSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  originalInput: z.string().max(8000).optional(),
  source: ConceptSourceSchema.default("web"),
  /** Convenience fields merged into content when `content` is omitted. */
  hook: z.string().max(2000).optional(),
  script: z.string().max(20000).optional(),
  selectedForInitialLaunch: z.boolean().default(false),
  content: ConceptContentSchema.optional(),
  visualPlan: VisualPlanSchema.optional(),
  publishingPack: PublishingPackSchema.optional(),
});
export type CreateConceptInput = z.infer<typeof CreateConceptInputSchema>;

/** Body for POST /api/concepts/:id/versions (edit → new draft) */
export const CreateConceptRevisionInputSchema = z.object({
  content: ConceptContentSchema.optional(),
  visualPlan: VisualPlanSchema.optional(),
  publishingPack: PublishingPackSchema.optional(),
  title: z.string().min(1).max(200).optional(),
});
export type CreateConceptRevisionInput = z.infer<
  typeof CreateConceptRevisionInputSchema
>;

/** Body for PATCH /api/projects/:id/initial-launch */
export const SetInitialLaunchInputSchema = z.object({
  conceptIds: z.array(z.string().uuid()).max(100),
  expectedVersion: z.number().int().positive(),
});
export type SetInitialLaunchInput = z.infer<typeof SetInitialLaunchInputSchema>;
