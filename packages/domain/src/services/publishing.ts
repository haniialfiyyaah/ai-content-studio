import {
  AppError,
  CreatePublishingJobInputSchema,
  ErrorCodes,
  type CreatePublishingJobInput,
  type PublishingJob,
  type PublishingJobStatus,
} from "@acs/schemas";
import type { z } from "zod";

/** Minimal query surface for publishing skeleton services. */
export interface PublishingDbClient {
  from: (table: string) => any;
}

interface PublishingJobRow {
  id: string;
  owner_id: string;
  project_id: string;
  video_attempt_id: string;
  output_asset_id: string;
  connected_account_id: string;
  scheduled_for: string | null;
  timezone: string | null;
  authorization_id: string | null;
  idempotency_key: string;
  status: PublishingJobStatus;
  provider_post_id: string | null;
  provider_url: string | null;
  created_at: string;
  updated_at: string;
}

export function mapPublishingJobRow(row: PublishingJobRow): PublishingJob {
  return {
    id: row.id,
    ownerId: row.owner_id,
    projectId: row.project_id,
    videoAttemptId: row.video_attempt_id,
    outputAssetId: row.output_asset_id,
    connectedAccountId: row.connected_account_id,
    scheduledFor: row.scheduled_for,
    timezone: row.timezone,
    authorizationId: row.authorization_id,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    providerPostId: row.provider_post_id,
    providerUrl: row.provider_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreatePublishingJobParams {
  ownerId: string;
  input: z.input<typeof CreatePublishingJobInputSchema>;
  correlationId?: string;
}

/**
 * Skeleton: creates a draft_intent publishing job from an approved attempt.
 * Does not call external platforms.
 */
export async function createPublishingJob(
  supabase: PublishingDbClient,
  params: CreatePublishingJobParams,
): Promise<{ job: PublishingJob; reused: boolean }> {
  const input: CreatePublishingJobInput = CreatePublishingJobInputSchema.parse(
    params.input,
  );

  const { data: existing } = await supabase
    .from("publishing_jobs")
    .select("*")
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();

  if (existing) {
    const row = existing as PublishingJobRow;
    if (row.owner_id !== params.ownerId) {
      throw new AppError(
        ErrorCodes.IDEMPOTENCY_CONFLICT,
        "Idempotency key already used by another owner",
        409,
      );
    }
    return { job: mapPublishingJobRow(row), reused: true };
  }

  const { data: attempt, error: attemptError } = await supabase
    .from("video_attempts")
    .select("id, status, approved_at, approval_revoked_at, output_asset_id, video_job_id")
    .eq("id", input.videoAttemptId)
    .maybeSingle();

  if (attemptError || !attempt) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Video attempt not found", 404);
  }

  if (
    attempt.status !== "approved" ||
    !attempt.approved_at ||
    attempt.approval_revoked_at
  ) {
    throw new AppError(
      ErrorCodes.VIDEO_NOT_APPROVED,
      "Publishing requires an approved, non-revoked video attempt",
      409,
    );
  }

  if (!attempt.output_asset_id) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      "Video attempt has no output asset to publish",
      400,
    );
  }

  const { data: jobRow, error: jobError } = await supabase
    .from("video_jobs")
    .select("id, project_id, owner_id")
    .eq("id", attempt.video_job_id)
    .eq("owner_id", params.ownerId)
    .maybeSingle();

  if (jobError || !jobRow) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Video job not found", 404);
  }

  const { data: account, error: accountError } = await supabase
    .from("connected_accounts")
    .select("id, status")
    .eq("id", input.connectedAccountId)
    .eq("owner_id", params.ownerId)
    .maybeSingle();

  if (accountError || !account) {
    throw new AppError(
      ErrorCodes.NOT_FOUND,
      "Connected account not found",
      404,
    );
  }

  if (account.status !== "connected") {
    throw new AppError(
      ErrorCodes.DESTINATION_UNAUTHORIZED,
      "Connected account is not authorized for publishing",
      403,
      { status: account.status },
    );
  }

  const { data: created, error: createError } = await supabase
    .from("publishing_jobs")
    .insert({
      owner_id: params.ownerId,
      project_id: jobRow.project_id,
      video_attempt_id: input.videoAttemptId,
      output_asset_id: attempt.output_asset_id,
      connected_account_id: input.connectedAccountId,
      metadata_snapshot: input.metadataSnapshot ?? {},
      scheduled_for: input.scheduledFor ?? null,
      timezone: input.timezone ?? null,
      authorization_id: input.authorizationId ?? null,
      idempotency_key: input.idempotencyKey,
      status: "draft_intent",
    })
    .select("*")
    .single();

  if (createError || !created) {
    if (createError?.code === "23505") {
      const { data: raced } = await supabase
        .from("publishing_jobs")
        .select("*")
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
      if (raced) {
        return {
          job: mapPublishingJobRow(raced as PublishingJobRow),
          reused: true,
        };
      }
    }
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to create publishing job",
      500,
      { correlationId: params.correlationId },
    );
  }

  await supabase.from("outbox_events").insert({
    owner_id: params.ownerId,
    event_type: "publishing.job.created",
    payload: {
      publishingJobId: (created as PublishingJobRow).id,
      videoAttemptId: input.videoAttemptId,
      connectedAccountId: input.connectedAccountId,
      correlationId: params.correlationId ?? null,
    },
    aggregate_type: "publishing_job",
    aggregate_id: (created as PublishingJobRow).id,
    status: "pending",
  });

  return {
    job: mapPublishingJobRow(created as PublishingJobRow),
    reused: false,
  };
}

export async function listPublishingJobs(
  supabase: PublishingDbClient,
  params: { ownerId: string; limit?: number },
): Promise<PublishingJob[]> {
  const { data, error } = await supabase
    .from("publishing_jobs")
    .select("*")
    .eq("owner_id", params.ownerId)
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 50);

  if (error) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to list publishing jobs",
      500,
    );
  }

  return ((data ?? []) as PublishingJobRow[]).map(mapPublishingJobRow);
}
