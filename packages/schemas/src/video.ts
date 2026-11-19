import { z } from "zod";
import {
  ProductionModeSchema,
  VideoJobStatusSchema,
} from "./enums";
import { IdempotencyKeySchema } from "./api";

export const VideoAttemptStatusSchema = z.enum([
  "queued",
  "preparing",
  "generating",
  "rendering",
  "validating",
  "ready_for_review",
  "approved",
  "blocked",
  "failed",
  "cancel_requested",
  "cancelled",
  "reconciling",
]);
export type VideoAttemptStatus = z.infer<typeof VideoAttemptStatusSchema>;

export const VideoJobSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  conceptId: z.string().uuid(),
  conceptVersionId: z.string().uuid(),
  ownerId: z.string().uuid(),
  productionMode: ProductionModeSchema,
  requestedProviderModel: z.string().nullable(),
  status: VideoJobStatusSchema,
  consentId: z.string().uuid().nullable(),
  estimatedCost: z.number().nullable(),
  reservedCost: z.number().nullable(),
  idempotencyKey: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type VideoJob = z.infer<typeof VideoJobSchema>;

export const VideoAttemptSchema = z.object({
  id: z.string().uuid(),
  videoJobId: z.string().uuid(),
  attemptNumber: z.number().int().positive(),
  provider: z.string().nullable(),
  modelId: z.string().nullable(),
  providerRequestId: z.string().nullable(),
  status: VideoAttemptStatusSchema,
  outputAssetId: z.string().uuid().nullable(),
  estimatedCost: z.number().nullable(),
  actualCost: z.number().nullable(),
  approvedAt: z.string().datetime().nullable(),
  approvalRevokedAt: z.string().datetime().nullable(),
  errorCode: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type VideoAttempt = z.infer<typeof VideoAttemptSchema>;

/** Body for POST /api/concept-versions/:id/render */
export const RequestRenderInputSchema = z.object({
  productionMode: ProductionModeSchema,
  consentId: z.string().uuid().optional(),
  estimatedCost: z.number().nonnegative().optional(),
  idempotencyKey: IdempotencyKeySchema,
  requestedProviderModel: z.string().max(200).optional(),
});
export type RequestRenderInput = z.infer<typeof RequestRenderInputSchema>;

export const RegenerateVideoJobInputSchema = z.object({
  idempotencyKey: IdempotencyKeySchema.optional(),
  reason: z.string().max(500).optional(),
});
export type RegenerateVideoJobInput = z.infer<
  typeof RegenerateVideoJobInputSchema
>;

const OptionalUuidOrEmpty = z
  .string()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined))
  .pipe(z.string().uuid().optional());

export const InternalJobClaimSchema = z.object({
  jobId: z.string().uuid(),
  kind: z.enum(["video", "publishing", "agent"]).default("video"),
  projectId: z.string().uuid().optional(),
  conceptVersionId: z.string().uuid().optional(),
  consentId: OptionalUuidOrEmpty,
  correlationId: z.string().optional(),
  claimedBy: z.string().max(120).optional(),
});
export type InternalJobClaim = z.infer<typeof InternalJobClaimSchema>;

export const InternalJobProgressSchema = z.object({
  jobId: z.string().uuid(),
  kind: z.enum(["video", "publishing", "agent"]).optional(),
  stage: z.string().min(1).max(64),
  state: z.string().min(1).max(64).default("running"),
  message: z.string().max(2000).optional(),
  productionMode: ProductionModeSchema.optional(),
  correlationId: z.string().optional(),
});
export type InternalJobProgress = z.infer<typeof InternalJobProgressSchema>;

export const InternalJobCompleteSchema = z.object({
  jobId: z.string().uuid(),
  kind: z.enum(["video", "publishing", "agent"]).default("video"),
  state: z.string().min(1).max(64).optional(),
  productionMode: ProductionModeSchema.optional(),
  providerRequestId: z
    .string()
    .max(200)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  outputAssetId: z.string().uuid().optional(),
  actualCost: z.number().nonnegative().optional(),
  correlationId: z.string().optional(),
});
export type InternalJobComplete = z.infer<typeof InternalJobCompleteSchema>;

export const InternalJobFailSchema = z.object({
  jobId: z.string().uuid(),
  kind: z.enum(["video", "publishing", "agent"]).default("video"),
  category: z.string().max(64).optional(),
  message: z.string().max(2000).optional(),
  state: z.string().max(64).optional(),
  correlationId: z.string().optional(),
});
export type InternalJobFail = z.infer<typeof InternalJobFailSchema>;
