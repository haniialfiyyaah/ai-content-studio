import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import {
  AppError,
  ErrorCodes,
  AWAITING_BROWSER_RENDER,
  completeVideoJob,
  failVideoJob,
  persistRenderVideoAsset,
  progressVideoJob,
  remotionWorkerRequirement,
  resolveRemotionRenderBackend,
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
 *
 * Default backend `browser`: marks the job awaiting client-side
 * @remotion/web-renderer export. Does not complete the job — success only
 * after MP4 upload via the browser-complete session API.
 *
 * Optional `legacy_worker`: previous apps/render-worker HTTP path.
 * `vercel_sandbox`: not provisioned — fails honestly.
 */
export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();

  try {
    assertInternalServiceAuth(request);
    const body = RemotionRenderSchema.parse(await request.json());
    const supabase = createAdminClient();
    const backend = resolveRemotionRenderBackend();
    const workerNotice = remotionWorkerRequirement(backend);

    const { data: job, error: jobError } = await supabase
      .from("video_jobs")
      .select("id, owner_id, project_id, concept_id, status, production_mode")
      .eq("id", body.jobId)
      .maybeSingle();

    if (jobError || !job) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Video job not found", 404);
    }

    if (backend === "vercel_sandbox") {
      await failVideoJob(supabase, {
        jobId: job.id,
        category: "VERCEL_SANDBOX_NOT_PROVISIONED",
        message:
          "Vercel Sandbox rendering is not provisioned. Use browser export or authorize Sandbox setup.",
        correlationId: body.correlationId ?? correlationId,
      });

      throw new AppError(
        ErrorCodes.PROVIDER_UNAVAILABLE,
        "Vercel Sandbox render backend is not available yet",
        501,
        { backend },
      );
    }

    if (backend === "browser") {
      const progressed = await progressVideoJob(supabase, {
        jobId: job.id,
        stage: "render_remotion",
        state: "running",
        message: AWAITING_BROWSER_RENDER,
        correlationId: body.correlationId ?? correlationId,
      });

      // Persist explicit awaiting flag for Content Detail / UI polling.
      await supabase
        .from("video_attempts")
        .update({
          error_details: {
            message: AWAITING_BROWSER_RENDER,
            stage: "render_remotion",
            backend: "browser",
            awaitingBrowser: true,
            title: body.title ?? null,
            scenes: body.scenes ?? null,
          },
          provider_request_id: `browser:pending:${job.id}`,
        })
        .eq("id", progressed.attempt.id);

      return jsonOk(
        {
          jobId: job.id,
          attemptId: progressed.attempt.id,
          fixture: false,
          remotion: true,
          backend: "browser" as const,
          awaitingBrowser: true,
          status: "awaiting_browser",
          outputAssetId: null,
          workerRequired: false,
          message:
            "Awaiting user-initiated browser MP4 export. Job is not ready_for_review until upload completes.",
          note: workerNotice.note,
        },
        body.correlationId ?? correlationId,
      );
    }

    // legacy_worker path (optional; not required for MVP)
    await progressVideoJob(supabase, {
      jobId: job.id,
      stage: "render_remotion",
      state: "running",
      message: "Remotion encode started (legacy worker)",
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
          backend: "legacy_worker" as const,
          awaitingBrowser: false,
          status: "accepted",
          outputAssetId: null,
          message: workerJson.message,
        },
        body.correlationId ?? correlationId,
      );
    }

    if (
      !workerRes.ok ||
      workerJson.status !== "completed" ||
      !workerJson.outputPath
    ) {
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
      width: 1280,
      height: 720,
      provider: "remotion",
      checksum,
    });

    const completed = await completeVideoJob(supabase, {
      jobId: job.id,
      providerRequestId: `remotion-worker:${fileName}`,
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
        backend: "legacy_worker" as const,
        awaitingBrowser: false,
        status: "completed",
        outputAssetId: asset.id,
        storagePath: asset.storagePath,
        bytes: asset.sizeBytes,
        message: "Remotion live encode persisted via legacy worker",
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
