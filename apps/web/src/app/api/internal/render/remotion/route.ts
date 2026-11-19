import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import {
  AppError,
  ErrorCodes,
  completeVideoJob,
  failVideoJob,
  persistRenderVideoAsset,
  progressVideoJob,
} from "@acs/domain";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const RemotionRenderSchema = z.object({
  jobId: z.string().uuid(),
  attemptId: z.string().uuid().optional(),
  title: z.string().max(200).optional(),
  scenes: z
    .array(
      z.object({
        narration: z.string().max(2000).optional(),
        caption: z.string().max(500).optional(),
      }),
    )
    .max(20)
    .optional(),
  correlationId: z.string().optional(),
});

interface WorkerRenderResult {
  status: "completed" | "accepted" | "failed";
  fixture: boolean;
  remotion: boolean;
  jobId: string | null;
  attemptId: string | null;
  outputPath: string | null;
  bytes?: number;
  durationMs?: number;
  error?: string;
  message?: string;
}

/**
 * POST /api/internal/render/remotion
 * Claims orchestration calls this after job claim. Invokes the Remotion worker,
 * persists MP4 to `renders` storage (live) or records fixture acceptance.
 */
export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();

  try {
    assertInternalServiceAuth(request);
    const body = RemotionRenderSchema.parse(await request.json());
    const supabase = createAdminClient();

    const { data: job, error: jobError } = await supabase
      .from("video_jobs")
      .select("id, owner_id, project_id, concept_id, status")
      .eq("id", body.jobId)
      .maybeSingle();

    if (jobError || !job) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Video job not found", 404);
    }

    await progressVideoJob(supabase, {
      jobId: job.id,
      stage: "render_remotion",
      state: "running",
      message: "Remotion encode started",
      correlationId: body.correlationId ?? correlationId,
    });

    const workerUrl = (
      process.env.RENDER_WORKER_URL ?? "http://127.0.0.1:3100"
    ).replace(/\/$/, "");
    const workerToken =
      process.env.RENDER_WORKER_TOKEN ?? "local-render-worker-token";

    const workerRes = await fetch(`${workerUrl}/render`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-render-token": workerToken,
      },
      body: JSON.stringify({
        jobId: body.jobId,
        attemptId: body.attemptId,
        title: body.title,
        scenes: body.scenes,
      }),
    });

    const workerJson = (await workerRes.json()) as WorkerRenderResult;

    // Fixture path — never pretend a real MP4 was produced.
    if (workerJson.fixture || workerJson.status === "accepted") {
      await progressVideoJob(supabase, {
        jobId: job.id,
        stage: "render_remotion",
        state: "fixture",
        message: workerJson.message ?? "Fixture Remotion path",
        correlationId: body.correlationId ?? correlationId,
      });

      return jsonOk(
        {
          jobId: job.id,
          fixture: true,
          remotion: false,
          status: "accepted",
          outputAssetId: null,
          message: workerJson.message,
        },
        body.correlationId ?? correlationId,
      );
    }

    if (!workerRes.ok || workerJson.status !== "completed" || !workerJson.outputPath) {
      await failVideoJob(supabase, {
        jobId: job.id,
        category: workerJson.error ?? "REMOTION_RENDER_FAILED",
        message: workerJson.message ?? "Remotion worker failed",
        correlationId: body.correlationId ?? correlationId,
      });

      throw new AppError(
        ErrorCodes.PROVIDER_UNAVAILABLE,
        workerJson.message ?? "Remotion render failed",
        502,
        { error: workerJson.error, fixture: false },
      );
    }

    const mp4Bytes = await loadWorkerOutput(
      workerUrl,
      workerToken,
      workerJson.outputPath,
    );
    const checksum = createHash("sha256").update(mp4Bytes).digest("hex");
    const fileName = basename(workerJson.outputPath);

    const asset = await persistRenderVideoAsset(supabase, {
      ownerId: job.owner_id,
      projectId: job.project_id,
      conceptId: job.concept_id,
      bytes: mp4Bytes,
      fileName,
      durationMs: workerJson.durationMs,
      provider: "remotion",
      checksum,
    });

    const completed = await completeVideoJob(supabase, {
      jobId: job.id,
      providerRequestId: `remotion:${fileName}`,
      outputAssetId: asset.id,
      actualCost: 0,
      correlationId: body.correlationId ?? correlationId,
    });

    return jsonOk(
      {
        jobId: completed.job.id,
        attemptId: completed.attempt.id,
        fixture: false,
        remotion: true,
        status: "completed",
        outputAssetId: asset.id,
        storagePath: asset.storagePath,
        bytes: asset.sizeBytes,
        message: "Remotion live encode persisted",
      },
      body.correlationId ?? correlationId,
    );
  } catch (error) {
    return jsonError(error, correlationId);
  }
}

/**
 * Prefer HTTP download from the worker so Next and worker need not share FS.
 * Falls back to local read when the path is on the same machine.
 */
async function loadWorkerOutput(
  workerUrl: string,
  workerToken: string,
  outputPath: string,
): Promise<Buffer> {
  const name = basename(outputPath);
  const downloadUrl = `${workerUrl}/outputs/${encodeURIComponent(name)}`;

  try {
    const res = await fetch(downloadUrl, {
      headers: { "x-render-token": workerToken },
    });
    if (res.ok) {
      const ab = await res.arrayBuffer();
      return Buffer.from(ab);
    }
  } catch {
    // Fall through to local filesystem read.
  }

  return readFile(outputPath);
}
