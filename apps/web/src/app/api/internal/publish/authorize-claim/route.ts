import { AppError, ErrorCodes } from "@acs/domain";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const AuthorizeClaimSchema = z.object({
  publishingJobId: z.string().uuid(),
  videoAttemptId: z.string().uuid().optional(),
  connectedAccountId: z.string().uuid().optional(),
  correlationId: z.string().optional(),
});

/**
 * POST /api/internal/publish/authorize-claim
 * Final permission check before a publish worker spends a destination grant.
 */
export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();

  try {
    assertInternalServiceAuth(request);
    const body = AuthorizeClaimSchema.parse(await request.json());
    const supabase = createAdminClient();
    const now = new Date().toISOString();

    const { data: job, error: jobError } = await supabase
      .from("publishing_jobs")
      .select(
        "id, owner_id, project_id, video_attempt_id, output_asset_id, connected_account_id, authorization_id, status",
      )
      .eq("id", body.publishingJobId)
      .maybeSingle();

    if (jobError || !job) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Publishing job not found", 404);
    }

    if (
      body.videoAttemptId &&
      body.videoAttemptId !== job.video_attempt_id
    ) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        "videoAttemptId does not match publishing job",
        400,
      );
    }

    if (
      body.connectedAccountId &&
      body.connectedAccountId !== job.connected_account_id
    ) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        "connectedAccountId does not match publishing job",
        400,
      );
    }

    const { data: project } = await supabase
      .from("projects")
      .select("id, status")
      .eq("id", job.project_id)
      .eq("owner_id", job.owner_id)
      .maybeSingle();

    if (!project || project.status !== "active") {
      return jsonOk(
        {
          authorized: false,
          reason: "project_not_active",
          publishingJobId: job.id,
        },
        body.correlationId ?? correlationId,
      );
    }

    const { data: attempt } = await supabase
      .from("video_attempts")
      .select("id, status, approved_at, approval_revoked_at, output_asset_id")
      .eq("id", job.video_attempt_id)
      .maybeSingle();

    if (
      !attempt ||
      attempt.status !== "approved" ||
      !attempt.approved_at ||
      attempt.approval_revoked_at
    ) {
      return jsonOk(
        {
          authorized: false,
          reason: "video_not_approved",
          publishingJobId: job.id,
        },
        body.correlationId ?? correlationId,
      );
    }

    const { data: account } = await supabase
      .from("connected_accounts")
      .select("id, status")
      .eq("id", job.connected_account_id)
      .eq("owner_id", job.owner_id)
      .maybeSingle();

    if (!account || account.status !== "connected") {
      return jsonOk(
        {
          authorized: false,
          reason: "destination_unauthorized",
          publishingJobId: job.id,
        },
        body.correlationId ?? correlationId,
      );
    }

    const { data: grants } = await supabase
      .from("authorization_grants")
      .select("id, project_id, destination_id, valid_until, revoked_at")
      .eq("owner_id", job.owner_id)
      .eq("scope", "publish_destination")
      .is("revoked_at", null);

    const grant = ((grants ?? []) as Array<{
      id: string;
      project_id: string | null;
      destination_id: string | null;
      valid_until: string | null;
    }>).find((row) => {
      if (row.project_id && row.project_id !== job.project_id) return false;
      if (row.destination_id && row.destination_id !== job.connected_account_id) {
        return false;
      }
      if (row.valid_until && row.valid_until < now) return false;
      return true;
    });

    if (!grant) {
      return jsonOk(
        {
          authorized: false,
          reason: "publish_grant_missing",
          publishingJobId: job.id,
        },
        body.correlationId ?? correlationId,
      );
    }

    if (!job.authorization_id) {
      await supabase
        .from("publishing_jobs")
        .update({ authorization_id: grant.id })
        .eq("id", job.id);
    }

    return jsonOk(
      {
        authorized: true,
        publishingJobId: job.id,
        projectId: job.project_id,
        videoAttemptId: job.video_attempt_id,
        connectedAccountId: job.connected_account_id,
        outputAssetId: job.output_asset_id,
        authorizationId: job.authorization_id ?? grant.id,
      },
      body.correlationId ?? correlationId,
    );
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
