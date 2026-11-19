import {
  AppError,
  ErrorCodes,
  ProductionModeSchema,
  type ProductionMode,
  type VideoAttempt,
  type VideoAttemptStatus,
  type VideoJob,
  type VideoJobStatus,
} from "@acs/schemas";

/** Minimal query surface for video services. */
export interface VideoDbClient {
  from: (table: string) => any;
}

interface ConceptVersionRow {
  id: string;
  concept_id: string;
  review_status: string;
  approval_revoked_at: string | null;
  content: unknown;
  visual_plan: unknown;
  publishing_pack: unknown;
}

interface ConceptRow {
  id: string;
  project_id: string;
  owner_id: string;
}

interface VideoJobRow {
  id: string;
  project_id: string;
  concept_id: string;
  concept_version_id: string;
  owner_id: string;
  production_mode: ProductionMode;
  requested_provider_model: string | null;
  status: VideoJobStatus;
  consent_id: string | null;
  estimated_cost: number | string | null;
  reserved_cost: number | string | null;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
}

interface VideoAttemptRow {
  id: string;
  video_job_id: string;
  attempt_number: number;
  provider: string | null;
  model_id: string | null;
  provider_request_id: string | null;
  status: VideoAttemptStatus;
  output_asset_id: string | null;
  estimated_cost: number | string | null;
  actual_cost: number | string | null;
  approved_at: string | null;
  approval_revoked_at: string | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
}

export function mapVideoJobRow(row: VideoJobRow): VideoJob {
  return {
    id: row.id,
    projectId: row.project_id,
    conceptId: row.concept_id,
    conceptVersionId: row.concept_version_id,
    ownerId: row.owner_id,
    productionMode: row.production_mode,
    requestedProviderModel: row.requested_provider_model,
    status: row.status,
    consentId: row.consent_id,
    estimatedCost: toNumberOrNull(row.estimated_cost),
    reservedCost: toNumberOrNull(row.reserved_cost),
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapVideoAttemptRow(row: VideoAttemptRow): VideoAttempt {
  return {
    id: row.id,
    videoJobId: row.video_job_id,
    attemptNumber: row.attempt_number,
    provider: row.provider,
    modelId: row.model_id,
    providerRequestId: row.provider_request_id,
    status: row.status,
    outputAssetId: row.output_asset_id,
    estimatedCost: toNumberOrNull(row.estimated_cost),
    actualCost: toNumberOrNull(row.actual_cost),
    approvedAt: row.approved_at,
    approvalRevokedAt: row.approval_revoked_at,
    errorCode: row.error_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toNumberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Ensures a concept version is approved and not revoked before paid render.
 */
export function assertConceptVersionRenderable(version: {
  reviewStatus: string;
  approvalRevokedAt: string | null;
}): void {
  if (version.reviewStatus !== "approved" || version.approvalRevokedAt) {
    throw new AppError(
      ErrorCodes.CONCEPT_NOT_APPROVED,
      "Concept version must be approved and non-revoked before render",
      409,
      {
        reviewStatus: version.reviewStatus,
        approvalRevokedAt: version.approvalRevokedAt,
      },
    );
  }
}

async function requireActiveProducePaidMediaGrant(
  supabase: VideoDbClient,
  params: { ownerId: string; projectId: string },
): Promise<string> {
  const now = new Date().toISOString();
  const { data: grants, error } = await supabase
    .from("authorization_grants")
    .select("id, valid_until, project_id")
    .eq("owner_id", params.ownerId)
    .eq("scope", "produce_paid_media")
    .is("revoked_at", null);

  if (error) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to load authorization grants",
      500,
    );
  }

  const match = ((grants ?? []) as Array<{
    id: string;
    valid_until: string | null;
    project_id: string | null;
  }>).find((grant) => {
    if (grant.project_id && grant.project_id !== params.projectId) {
      return false;
    }
    if (grant.valid_until && grant.valid_until < now) {
      return false;
    }
    return true;
  });

  if (!match) {
    throw new AppError(
      ErrorCodes.BUDGET_AUTHORIZATION_REQUIRED,
      "produce_paid_media authorization is required before video production",
      402,
      { projectId: params.projectId },
    );
  }

  return match.id;
}

export interface RequestRenderParams {
  ownerId: string;
  conceptVersionId: string;
  productionMode: ProductionMode;
  consentId?: string;
  estimatedCost?: number;
  idempotencyKey: string;
  requestedProviderModel?: string;
  correlationId?: string;
}

export interface RequestRenderResult {
  job: VideoJob;
  attempt: VideoAttempt;
  reused: boolean;
}

/**
 * Queues a video job + first attempt from an approved concept version.
 * Requires an active produce_paid_media grant; emits video.production.requested.
 */
export async function requestRender(
  supabase: VideoDbClient,
  params: RequestRenderParams,
): Promise<RequestRenderResult> {
  const productionMode = ProductionModeSchema.parse(params.productionMode);

  const { data: existingJob } = await supabase
    .from("video_jobs")
    .select("*")
    .eq("idempotency_key", params.idempotencyKey)
    .maybeSingle();

  if (existingJob) {
    const job = existingJob as VideoJobRow;
    if (job.owner_id !== params.ownerId) {
      throw new AppError(
        ErrorCodes.IDEMPOTENCY_CONFLICT,
        "Idempotency key already used by another owner",
        409,
      );
    }
    const attempt = await loadLatestAttempt(supabase, job.id);
    return {
      job: mapVideoJobRow(job),
      attempt: mapVideoAttemptRow(attempt),
      reused: true,
    };
  }

  const { data: versionRow, error: versionError } = await supabase
    .from("concept_versions")
    .select("*")
    .eq("id", params.conceptVersionId)
    .maybeSingle();

  if (versionError || !versionRow) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Concept version not found", 404);
  }

  const version = versionRow as ConceptVersionRow;
  assertConceptVersionRenderable({
    reviewStatus: version.review_status,
    approvalRevokedAt: version.approval_revoked_at,
  });

  const { data: conceptRow, error: conceptError } = await supabase
    .from("concepts")
    .select("id, project_id, owner_id")
    .eq("id", version.concept_id)
    .eq("owner_id", params.ownerId)
    .maybeSingle();

  if (conceptError || !conceptRow) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Concept not found", 404);
  }

  const concept = conceptRow as ConceptRow;
  const grantId = await requireActiveProducePaidMediaGrant(supabase, {
    ownerId: params.ownerId,
    projectId: concept.project_id,
  });

  const inputSnapshot = {
    conceptVersionId: version.id,
    content: version.content ?? {},
    visualPlan: version.visual_plan ?? {},
    publishingPack: version.publishing_pack ?? {},
    authorizationGrantId: grantId,
  };

  const { data: jobRow, error: jobError } = await supabase
    .from("video_jobs")
    .insert({
      project_id: concept.project_id,
      concept_id: concept.id,
      concept_version_id: version.id,
      owner_id: params.ownerId,
      production_mode: productionMode,
      requested_provider_model: params.requestedProviderModel ?? null,
      input_snapshot: inputSnapshot,
      status: "queued",
      consent_id: params.consentId ?? null,
      estimated_cost: params.estimatedCost ?? null,
      reserved_cost: params.estimatedCost ?? null,
      idempotency_key: params.idempotencyKey,
    })
    .select("*")
    .single();

  if (jobError || !jobRow) {
    // Concurrent idempotent insert — reload by key.
    if (jobError?.code === "23505") {
      const { data: raced } = await supabase
        .from("video_jobs")
        .select("*")
        .eq("idempotency_key", params.idempotencyKey)
        .maybeSingle();
      if (raced) {
        const job = raced as VideoJobRow;
        const attempt = await loadLatestAttempt(supabase, job.id);
        return {
          job: mapVideoJobRow(job),
          attempt: mapVideoAttemptRow(attempt),
          reused: true,
        };
      }
    }
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to create video job",
      500,
      { correlationId: params.correlationId },
    );
  }

  const job = jobRow as VideoJobRow;

  const { data: attemptRow, error: attemptError } = await supabase
    .from("video_attempts")
    .insert({
      video_job_id: job.id,
      attempt_number: 1,
      status: "queued",
      estimated_cost: params.estimatedCost ?? null,
      settings_snapshot: {
        productionMode,
        consentId: params.consentId ?? null,
      },
    })
    .select("*")
    .single();

  if (attemptError || !attemptRow) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to create video attempt",
      500,
      { correlationId: params.correlationId },
    );
  }

  await supabase.from("outbox_events").insert({
    owner_id: params.ownerId,
    event_type: "video.production.requested",
    payload: {
      jobId: job.id,
      attemptId: (attemptRow as VideoAttemptRow).id,
      projectId: job.project_id,
      conceptId: job.concept_id,
      conceptVersionId: job.concept_version_id,
      productionMode: job.production_mode,
      consentId: job.consent_id,
      correlationId: params.correlationId ?? null,
    },
    aggregate_type: "video_job",
    aggregate_id: job.id,
    status: "pending",
  });

  return {
    job: mapVideoJobRow(job),
    attempt: mapVideoAttemptRow(attemptRow as VideoAttemptRow),
    reused: false,
  };
}

export interface ApproveVideoAttemptParams {
  attemptId: string;
  ownerId: string;
  actorId?: string;
  requestId?: string;
  correlationId?: string;
}

/**
 * Approves an immutable video attempt that is ready for review.
 */
export async function approveVideoAttempt(
  supabase: VideoDbClient,
  params: ApproveVideoAttemptParams,
): Promise<{ job: VideoJob; attempt: VideoAttempt }> {
  const { job, attempt } = await loadOwnedAttempt(
    supabase,
    params.attemptId,
    params.ownerId,
  );

  if (attempt.approval_revoked_at) {
    throw new AppError(
      ErrorCodes.VIDEO_NOT_APPROVED,
      "Cannot re-approve a revoked video attempt",
      409,
    );
  }

  if (attempt.status === "approved" && attempt.approved_at) {
    return {
      job: mapVideoJobRow(job),
      attempt: mapVideoAttemptRow(attempt),
    };
  }

  if (attempt.status !== "ready_for_review") {
    throw new AppError(
      ErrorCodes.VIDEO_NOT_APPROVED,
      "Video attempt must be ready_for_review before approval",
      409,
      { status: attempt.status },
    );
  }

  const now = new Date().toISOString();
  const actorId = params.actorId ?? params.ownerId;

  const { data: approvedRow, error: approveError } = await supabase
    .from("video_attempts")
    .update({
      status: "approved",
      approved_at: now,
      approved_by: actorId,
      approval_revoked_at: null,
    })
    .eq("id", attempt.id)
    .select("*")
    .single();

  if (approveError || !approvedRow) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to approve video attempt",
      500,
      { correlationId: params.correlationId },
    );
  }

  await supabase.from("approval_events").insert({
    owner_id: params.ownerId,
    actor_id: actorId,
    object_type: "video_attempt",
    object_id: attempt.id,
    version_or_attempt_id: attempt.id,
    event: "approved",
    request_id: params.requestId ?? params.correlationId ?? null,
  });

  return {
    job: mapVideoJobRow(job),
    attempt: mapVideoAttemptRow(approvedRow as VideoAttemptRow),
  };
}

export interface RevokeVideoAttemptParams {
  attemptId: string;
  ownerId: string;
  actorId?: string;
  requestId?: string;
  correlationId?: string;
}

/** Revokes a previously approved video attempt. */
export async function revokeVideoAttempt(
  supabase: VideoDbClient,
  params: RevokeVideoAttemptParams,
): Promise<{ job: VideoJob; attempt: VideoAttempt }> {
  const { job, attempt } = await loadOwnedAttempt(
    supabase,
    params.attemptId,
    params.ownerId,
  );

  if (attempt.status !== "approved" || !attempt.approved_at) {
    throw new AppError(
      ErrorCodes.VIDEO_NOT_APPROVED,
      "Only approved video attempts can be revoked",
      409,
      { status: attempt.status },
    );
  }

  if (attempt.approval_revoked_at) {
    return {
      job: mapVideoJobRow(job),
      attempt: mapVideoAttemptRow(attempt),
    };
  }

  const now = new Date().toISOString();
  const actorId = params.actorId ?? params.ownerId;

  const { data: revokedRow, error } = await supabase
    .from("video_attempts")
    .update({
      approval_revoked_at: now,
    })
    .eq("id", attempt.id)
    .select("*")
    .single();

  if (error || !revokedRow) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to revoke video attempt",
      500,
      { correlationId: params.correlationId },
    );
  }

  await supabase.from("approval_events").insert({
    owner_id: params.ownerId,
    actor_id: actorId,
    object_type: "video_attempt",
    object_id: attempt.id,
    version_or_attempt_id: attempt.id,
    event: "revoked",
    request_id: params.requestId ?? params.correlationId ?? null,
  });

  return {
    job: mapVideoJobRow(job),
    attempt: mapVideoAttemptRow(revokedRow as VideoAttemptRow),
  };
}

export interface RegenerateVideoJobParams {
  jobId: string;
  ownerId: string;
  reason?: string;
  correlationId?: string;
}

/**
 * Queues a new attempt on an existing job and re-emits production requested.
 */
export async function regenerateVideoJob(
  supabase: VideoDbClient,
  params: RegenerateVideoJobParams,
): Promise<{ job: VideoJob; attempt: VideoAttempt }> {
  const { data: jobRow, error: jobError } = await supabase
    .from("video_jobs")
    .select("*")
    .eq("id", params.jobId)
    .eq("owner_id", params.ownerId)
    .maybeSingle();

  if (jobError || !jobRow) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Video job not found", 404);
  }

  const job = jobRow as VideoJobRow;

  assertConceptVersionRenderable(
    await loadConceptVersionFlags(supabase, job.concept_version_id),
  );

  await requireActiveProducePaidMediaGrant(supabase, {
    ownerId: params.ownerId,
    projectId: job.project_id,
  });

  const latest = await loadLatestAttempt(supabase, job.id);
  const nextNumber = latest.attempt_number + 1;

  const { data: attemptRow, error: attemptError } = await supabase
    .from("video_attempts")
    .insert({
      video_job_id: job.id,
      attempt_number: nextNumber,
      status: "queued",
      estimated_cost: job.estimated_cost,
      settings_snapshot: {
        productionMode: job.production_mode,
        regenerateFromAttemptId: latest.id,
        reason: params.reason ?? null,
      },
    })
    .select("*")
    .single();

  if (attemptError || !attemptRow) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to create regenerated video attempt",
      500,
      { correlationId: params.correlationId },
    );
  }

  const { data: updatedJob, error: updateError } = await supabase
    .from("video_jobs")
    .update({ status: "queued" })
    .eq("id", job.id)
    .eq("owner_id", params.ownerId)
    .select("*")
    .single();

  if (updateError || !updatedJob) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to reset video job for regeneration",
      500,
      { correlationId: params.correlationId },
    );
  }

  const attempt = attemptRow as VideoAttemptRow;

  await supabase.from("outbox_events").insert({
    owner_id: params.ownerId,
    event_type: "video.production.requested",
    payload: {
      jobId: job.id,
      attemptId: attempt.id,
      projectId: job.project_id,
      conceptId: job.concept_id,
      conceptVersionId: job.concept_version_id,
      productionMode: job.production_mode,
      consentId: job.consent_id,
      regenerate: true,
      correlationId: params.correlationId ?? null,
    },
    aggregate_type: "video_job",
    aggregate_id: job.id,
    status: "pending",
  });

  return {
    job: mapVideoJobRow(updatedJob as VideoJobRow),
    attempt: mapVideoAttemptRow(attempt),
  };
}

export interface ClaimVideoJobParams {
  jobId: string;
  claimedBy?: string;
  correlationId?: string;
}

/**
 * Internal worker claim — moves queued job/attempt into preparing.
 */
export async function claimVideoJob(
  supabase: VideoDbClient,
  params: ClaimVideoJobParams,
): Promise<{ claim: "acquired" | "already_claimed" | "not_claimable"; job: VideoJob; attempt: VideoAttempt | null }> {
  const { data: jobRow, error } = await supabase
    .from("video_jobs")
    .select("*")
    .eq("id", params.jobId)
    .maybeSingle();

  if (error || !jobRow) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Video job not found", 404);
  }

  const job = jobRow as VideoJobRow;
  const attempt = await loadLatestAttempt(supabase, job.id);

  const activeStatuses: VideoJobStatus[] = [
    "preparing",
    "generating",
    "rendering",
    "validating",
  ];
  if (activeStatuses.includes(job.status)) {
    return {
      claim: "already_claimed",
      job: mapVideoJobRow(job),
      attempt: mapVideoAttemptRow(attempt),
    };
  }

  if (job.status !== "queued" && job.status !== "failed") {
    return {
      claim: "not_claimable",
      job: mapVideoJobRow(job),
      attempt: mapVideoAttemptRow(attempt),
    };
  }

  const now = new Date().toISOString();
  const { data: updatedJob, error: updateError } = await supabase
    .from("video_jobs")
    .update({ status: "preparing" })
    .eq("id", job.id)
    .in("status", ["queued", "failed"])
    .select("*")
    .single();

  if (updateError || !updatedJob) {
    // Lost the race — treat as already claimed.
    const refreshed = await reloadJob(supabase, job.id);
    return {
      claim: "already_claimed",
      job: mapVideoJobRow(refreshed),
      attempt: mapVideoAttemptRow(await loadLatestAttempt(supabase, job.id)),
    };
  }

  await supabase
    .from("video_attempts")
    .update({
      status: "preparing",
      render_started_at: now,
    })
    .eq("id", attempt.id);

  const refreshedAttempt = await loadLatestAttempt(supabase, job.id);

  return {
    claim: "acquired",
    job: mapVideoJobRow(updatedJob as VideoJobRow),
    attempt: mapVideoAttemptRow(refreshedAttempt),
  };
}

export interface ProgressVideoJobParams {
  jobId: string;
  stage: string;
  state?: string;
  message?: string;
  correlationId?: string;
}

/** Maps worker stage updates onto job + latest attempt status. */
export async function progressVideoJob(
  supabase: VideoDbClient,
  params: ProgressVideoJobParams,
): Promise<{ job: VideoJob; attempt: VideoAttempt }> {
  const job = await reloadJob(supabase, params.jobId);
  const attempt = await loadLatestAttempt(supabase, job.id);
  const status = mapStageToStatus(params.stage, params.state);

  const { data: updatedJob, error: jobError } = await supabase
    .from("video_jobs")
    .update({ status })
    .eq("id", job.id)
    .select("*")
    .single();

  if (jobError || !updatedJob) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to update video job progress",
      500,
      { correlationId: params.correlationId },
    );
  }

  const { data: updatedAttempt, error: attemptError } = await supabase
    .from("video_attempts")
    .update({
      status,
      error_details: params.message
        ? { message: params.message, stage: params.stage }
        : {},
    })
    .eq("id", attempt.id)
    .select("*")
    .single();

  if (attemptError || !updatedAttempt) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to update video attempt progress",
      500,
      { correlationId: params.correlationId },
    );
  }

  return {
    job: mapVideoJobRow(updatedJob as VideoJobRow),
    attempt: mapVideoAttemptRow(updatedAttempt as VideoAttemptRow),
  };
}

export interface CompleteVideoJobParams {
  jobId: string;
  providerRequestId?: string;
  outputAssetId?: string;
  actualCost?: number;
  correlationId?: string;
}

/** Marks job/attempt ready_for_review after successful production. */
export async function completeVideoJob(
  supabase: VideoDbClient,
  params: CompleteVideoJobParams,
): Promise<{ job: VideoJob; attempt: VideoAttempt }> {
  const job = await reloadJob(supabase, params.jobId);
  const attempt = await loadLatestAttempt(supabase, job.id);
  const now = new Date().toISOString();

  const { data: updatedJob, error: jobError } = await supabase
    .from("video_jobs")
    .update({ status: "ready_for_review" })
    .eq("id", job.id)
    .select("*")
    .single();

  if (jobError || !updatedJob) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to complete video job",
      500,
      { correlationId: params.correlationId },
    );
  }

  const attemptPatch: Record<string, unknown> = {
    status: "ready_for_review",
    render_finished_at: now,
    error_code: null,
    error_details: {},
  };
  if (params.providerRequestId) {
    attemptPatch.provider_request_id = params.providerRequestId;
  }
  if (params.outputAssetId) {
    attemptPatch.output_asset_id = params.outputAssetId;
  }
  if (params.actualCost !== undefined) {
    attemptPatch.actual_cost = params.actualCost;
  }

  const { data: updatedAttempt, error: attemptError } = await supabase
    .from("video_attempts")
    .update(attemptPatch)
    .eq("id", attempt.id)
    .select("*")
    .single();

  if (attemptError || !updatedAttempt) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to complete video attempt",
      500,
      { correlationId: params.correlationId },
    );
  }

  return {
    job: mapVideoJobRow(updatedJob as VideoJobRow),
    attempt: mapVideoAttemptRow(updatedAttempt as VideoAttemptRow),
  };
}

export interface FailVideoJobParams {
  jobId: string;
  category?: string;
  message?: string;
  correlationId?: string;
}

/** Marks job/attempt failed with worker-supplied error context. */
export async function failVideoJob(
  supabase: VideoDbClient,
  params: FailVideoJobParams,
): Promise<{ job: VideoJob; attempt: VideoAttempt }> {
  const job = await reloadJob(supabase, params.jobId);
  const attempt = await loadLatestAttempt(supabase, job.id);
  const now = new Date().toISOString();
  const errorCode = params.category ?? "PROVIDER_FAILED";

  const { data: updatedJob, error: jobError } = await supabase
    .from("video_jobs")
    .update({ status: "failed" })
    .eq("id", job.id)
    .select("*")
    .single();

  if (jobError || !updatedJob) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to mark video job failed",
      500,
      { correlationId: params.correlationId },
    );
  }

  const { data: updatedAttempt, error: attemptError } = await supabase
    .from("video_attempts")
    .update({
      status: "failed",
      render_finished_at: now,
      error_code: errorCode,
      error_details: {
        message: params.message ?? "Video production failed",
        category: params.category ?? null,
      },
    })
    .eq("id", attempt.id)
    .select("*")
    .single();

  if (attemptError || !updatedAttempt) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to mark video attempt failed",
      500,
      { correlationId: params.correlationId },
    );
  }

  return {
    job: mapVideoJobRow(updatedJob as VideoJobRow),
    attempt: mapVideoAttemptRow(updatedAttempt as VideoAttemptRow),
  };
}

export interface ListVideosParams {
  ownerId: string;
  projectId?: string;
  limit?: number;
}

/** Lists recent video attempts for the owner (joined via jobs). */
export async function listVideoAttempts(
  supabase: VideoDbClient,
  params: ListVideosParams,
): Promise<Array<{ job: VideoJob; attempt: VideoAttempt }>> {
  let jobsQuery = supabase
    .from("video_jobs")
    .select("*")
    .eq("owner_id", params.ownerId)
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 50);

  if (params.projectId) {
    jobsQuery = jobsQuery.eq("project_id", params.projectId);
  }

  const { data: jobs, error: jobsError } = await jobsQuery;
  if (jobsError) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to list video jobs",
      500,
    );
  }

  const jobRows = (jobs ?? []) as VideoJobRow[];
  if (jobRows.length === 0) return [];

  const jobIds = jobRows.map((j) => j.id);
  const { data: attempts, error: attemptsError } = await supabase
    .from("video_attempts")
    .select("*")
    .in("video_job_id", jobIds)
    .order("attempt_number", { ascending: false });

  if (attemptsError) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to list video attempts",
      500,
    );
  }

  const byJob = new Map<string, VideoAttemptRow[]>();
  for (const row of (attempts ?? []) as VideoAttemptRow[]) {
    const list = byJob.get(row.video_job_id) ?? [];
    list.push(row);
    byJob.set(row.video_job_id, list);
  }

  const results: Array<{ job: VideoJob; attempt: VideoAttempt }> = [];
  for (const job of jobRows) {
    const list = byJob.get(job.id) ?? [];
    for (const attempt of list) {
      results.push({
        job: mapVideoJobRow(job),
        attempt: mapVideoAttemptRow(attempt),
      });
    }
  }
  return results;
}

export async function getVideoJob(
  supabase: VideoDbClient,
  params: { jobId: string; ownerId: string },
): Promise<{ job: VideoJob; attempts: VideoAttempt[] }> {
  const { data: jobRow, error } = await supabase
    .from("video_jobs")
    .select("*")
    .eq("id", params.jobId)
    .eq("owner_id", params.ownerId)
    .maybeSingle();

  if (error || !jobRow) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Video job not found", 404);
  }

  const { data: attempts, error: attemptsError } = await supabase
    .from("video_attempts")
    .select("*")
    .eq("video_job_id", params.jobId)
    .order("attempt_number", { ascending: true });

  if (attemptsError) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to load video attempts",
      500,
    );
  }

  return {
    job: mapVideoJobRow(jobRow as VideoJobRow),
    attempts: ((attempts ?? []) as VideoAttemptRow[]).map(mapVideoAttemptRow),
  };
}

function mapStageToStatus(
  stage: string,
  state?: string,
): VideoJobStatus {
  if (state === "reconciling") return "reconciling";
  if (state === "blocked") return "blocked";
  if (state === "failed") return "failed";

  const normalized = stage.toLowerCase();
  if (normalized.includes("voice") || normalized.includes("generat")) {
    return "generating";
  }
  if (normalized.includes("render")) {
    return "rendering";
  }
  if (normalized.includes("valid")) {
    return "validating";
  }
  if (normalized.includes("prepar")) {
    return "preparing";
  }
  return "generating";
}

async function loadLatestAttempt(
  supabase: VideoDbClient,
  videoJobId: string,
): Promise<VideoAttemptRow> {
  const { data, error } = await supabase
    .from("video_attempts")
    .select("*")
    .eq("video_job_id", videoJobId)
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Video attempt not found", 404);
  }
  return data as VideoAttemptRow;
}

async function reloadJob(
  supabase: VideoDbClient,
  jobId: string,
): Promise<VideoJobRow> {
  const { data, error } = await supabase
    .from("video_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (error || !data) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Video job not found", 404);
  }
  return data as VideoJobRow;
}

async function loadOwnedAttempt(
  supabase: VideoDbClient,
  attemptId: string,
  ownerId: string,
): Promise<{ job: VideoJobRow; attempt: VideoAttemptRow }> {
  const { data: attemptRow, error: attemptError } = await supabase
    .from("video_attempts")
    .select("*")
    .eq("id", attemptId)
    .maybeSingle();

  if (attemptError || !attemptRow) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Video attempt not found", 404);
  }

  const attempt = attemptRow as VideoAttemptRow;
  const { data: jobRow, error: jobError } = await supabase
    .from("video_jobs")
    .select("*")
    .eq("id", attempt.video_job_id)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (jobError || !jobRow) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Video job not found", 404);
  }

  return { job: jobRow as VideoJobRow, attempt };
}

async function loadConceptVersionFlags(
  supabase: VideoDbClient,
  versionId: string,
): Promise<{ reviewStatus: string; approvalRevokedAt: string | null }> {
  const { data, error } = await supabase
    .from("concept_versions")
    .select("review_status, approval_revoked_at")
    .eq("id", versionId)
    .maybeSingle();

  if (error || !data) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Concept version not found", 404);
  }

  return {
    reviewStatus: (data as ConceptVersionRow).review_status,
    approvalRevokedAt: (data as ConceptVersionRow).approval_revoked_at,
  };
}
