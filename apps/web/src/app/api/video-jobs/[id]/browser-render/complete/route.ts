import { createHash } from "node:crypto";
import {
  AppError,
  ErrorCodes,
  completeVideoJob,
  persistRenderVideoAsset,
} from "@acs/domain";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MAX_MP4_BYTES = 80 * 1024 * 1024; // 80 MB safety cap for browser MVP

/**
 * POST /api/video-jobs/[id]/browser-render/complete
 * Multipart form: field `file` (video/mp4). Verifies ownership, uploads to
 * Supabase `renders`, persists media_assets, then marks ready_for_review.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const correlationId = crypto.randomUUID();

  try {
    const { id: jobId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new AppError(ErrorCodes.UNAUTHENTICATED, "Not signed in", 401);
    }

    const { data: ownedJob, error: ownedError } = await supabase
      .from("video_jobs")
      .select(
        "id, owner_id, project_id, concept_id, status, production_mode",
      )
      .eq("id", jobId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (ownedError || !ownedJob) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Video job not found", 404);
    }

    if (ownedJob.production_mode !== "remotion") {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        "Browser complete requires productionMode=remotion",
        409,
      );
    }

    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        "Missing multipart field `file` (MP4 blob)",
        400,
      );
    }

    if (file.size <= 0 || file.size > MAX_MP4_BYTES) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        `MP4 size out of range (1 byte – ${MAX_MP4_BYTES} bytes)`,
        400,
        { size: file.size },
      );
    }

    const mime = file.type || "video/mp4";
    if (!mime.includes("mp4") && !mime.includes("octet-stream")) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        "Expected video/mp4 upload",
        400,
        { mime },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const mp4Bytes = Buffer.from(arrayBuffer);

    // Minimal MP4 signature check (ftyp box)
    const header = mp4Bytes.subarray(4, 8).toString("ascii");
    if (header !== "ftyp") {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        "Upload does not look like a valid MP4 (missing ftyp)",
        400,
      );
    }

    const checksum = createHash("sha256").update(mp4Bytes).digest("hex");
    const fileName = `browser-${jobId.slice(0, 8)}-${Date.now()}.mp4`;
    const durationMsRaw = form.get("durationMs");
    const durationMs =
      typeof durationMsRaw === "string" && durationMsRaw.length > 0
        ? Number(durationMsRaw)
        : undefined;

    const admin = createAdminClient();
    const asset = await persistRenderVideoAsset(admin, {
      ownerId: ownedJob.owner_id,
      projectId: ownedJob.project_id,
      conceptId: ownedJob.concept_id,
      bytes: mp4Bytes,
      fileName,
      mimeType: "video/mp4",
      width: 1280,
      height: 720,
      durationMs:
        durationMs != null && Number.isFinite(durationMs)
          ? Math.round(durationMs)
          : undefined,
      provider: "remotion-web-renderer",
      modelId: "ShortFormVideo",
      checksum,
    });

    // Verify storage object exists before completing the job.
    const { data: listed, error: listError } = await admin.storage
      .from("renders")
      .list(`${ownedJob.owner_id}/${ownedJob.project_id}`, {
        search: fileName,
        limit: 1,
      });

    if (listError || !listed?.some((o) => o.name === fileName)) {
      // Fallback: try signed URL as existence proof
      const { data: signed, error: signedError } = await admin.storage
        .from("renders")
        .createSignedUrl(asset.storagePath, 60);
      if (signedError || !signed?.signedUrl) {
        throw new AppError(
          ErrorCodes.INTERNAL_ERROR,
          "MP4 upload could not be verified in storage",
          500,
          { storagePath: asset.storagePath },
        );
      }
    }

    const completed = await completeVideoJob(admin, {
      jobId: ownedJob.id,
      providerRequestId: `browser:${checksum.slice(0, 16)}`,
      outputAssetId: asset.id,
      actualCost: 0,
      correlationId,
    });

    await admin
      .from("video_attempts")
      .update({
        error_details: {
          message: "browser_render_completed",
          backend: "browser",
          awaitingBrowser: false,
          checksum,
          bytes: asset.sizeBytes,
        },
      })
      .eq("id", completed.attempt.id);

    return jsonOk(
      {
        jobId: completed.job.id,
        attemptId: completed.attempt.id,
        outputAssetId: asset.id,
        storagePath: asset.storagePath,
        bytes: asset.sizeBytes,
        checksum,
        status: completed.attempt.status,
        reviewPath: `/videos/${completed.attempt.id}`,
        message: "Browser Remotion MP4 uploaded and verified",
      },
      correlationId,
    );
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
