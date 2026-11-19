import { z } from "zod";
import { PublishingJobStatusSchema } from "./enums";
import { IdempotencyKeySchema } from "./api";

export const PublishingJobSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  projectId: z.string().uuid(),
  videoAttemptId: z.string().uuid(),
  outputAssetId: z.string().uuid(),
  connectedAccountId: z.string().uuid(),
  scheduledFor: z.string().datetime().nullable(),
  timezone: z.string().nullable(),
  authorizationId: z.string().uuid().nullable(),
  idempotencyKey: z.string(),
  status: PublishingJobStatusSchema,
  providerPostId: z.string().nullable(),
  providerUrl: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PublishingJob = z.infer<typeof PublishingJobSchema>;

/** Body for POST /api/publishing-jobs — skeleton draft intent. */
export const CreatePublishingJobInputSchema = z.object({
  videoAttemptId: z.string().uuid(),
  connectedAccountId: z.string().uuid(),
  scheduledFor: z.string().datetime().optional(),
  timezone: z.string().max(64).optional(),
  authorizationId: z.string().uuid().optional(),
  metadataSnapshot: z.record(z.unknown()).optional(),
  idempotencyKey: IdempotencyKeySchema,
});
export type CreatePublishingJobInput = z.infer<
  typeof CreatePublishingJobInputSchema
>;
