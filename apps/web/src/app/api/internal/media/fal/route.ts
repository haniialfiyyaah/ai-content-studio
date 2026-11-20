import { z } from "zod";
import {
  ACS_FAL_DEMO_MODEL,
  executeFalRender,
  pollFalRender,
} from "@acs/integrations";
import { persistRenderVideoAsset } from "@acs/domain";
import { jsonError, jsonOk } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const FalBodySchema = z.object({
  action: z.enum(["submit", "poll"]).default("submit"),
  jobId: z.string().uuid().optional(),
  prompt: z.string().min(1).max(4000).optional(),
  model: z.string().max(200).optional(),
  aspectRatio: z.string().max(20).optional(),
  seed: z.number().int().optional(),
  providerRequestId: z.string().max(200).optional(),
  correlationId: z.string().optional(),
});

/**
 * POST /api/internal/media/fal — fal.ai submit/poll for n8n (fixture or live).
 * Never logs API keys. Paid calls only when FAL_KEY set and ACS_FAL_FIXTURE_MODE=false.
 *
 * When `jobId` is supplied and fal reports status "completed", this downloads
 * the output and persists a real media_assets row — WF-02 must not call
 * jobs/complete until a response here carries `outputAssetId`.
 */
export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();

  try {
    assertInternalServiceAuth(request);
    const body = FalBodySchema.parse(await request.json());
    const fixtureMode = process.env.ACS_FAL_FIXTURE_MODE !== "false";
    const apiKey = process.env.FAL_KEY ?? null;

    if (body.action === "poll") {
      if (!body.providerRequestId) {
        return jsonError(
          new Error("providerRequestId required for poll"),
          body.correlationId ?? correlationId,
        );
      }
      const result = await pollFalRender(body.providerRequestId, {
        fixtureMode,
        apiKey,
        model: body.model,
      });
      const persisted = await maybePersistFalOutput(
        body.jobId,
        result,
        body.correlationId ?? correlationId,
      );
      return jsonOk(
        { ...result, ...persisted },
        body.correlationId ?? correlationId,
      );
    }

    if (!body.prompt) {
      return jsonError(
        new Error("prompt required for submit"),
        body.correlationId ?? correlationId,
      );
    }

    const result = await executeFalRender(
      {
        prompt: body.prompt,
        model: body.model ?? ACS_FAL_DEMO_MODEL,
        aspectRatio: body.aspectRatio ?? "16:9",
        seed: body.seed,
      },
      { fixtureMode, apiKey },
    );

    const persisted = await maybePersistFalOutput(
      body.jobId,
      result,
      body.correlationId ?? correlationId,
    );

    return jsonOk(
      { ...result, ...persisted },
      body.correlationId ?? correlationId,
    );
  } catch (error) {
    return jsonError(error, correlationId);
  }
}

/**
 * Downloads a completed fal output and persists it as a media asset.
 * No-op (returns `{}`) unless jobId is given and fal reports completion —
 * callers must treat a missing outputAssetId as "not ready yet".
 */
async function maybePersistFalOutput(
  jobId: string | undefined,
  result: { status?: string; outputUrl?: string | null; fixture?: boolean },
  correlationId: string,
): Promise<{ outputAssetId?: string } > {
  if (!jobId || result.status !== "completed" || !result.outputUrl) {
    return {};
  }

  const supabase = createAdminClient();
  const { data: job } = await supabase
    .from("video_jobs")
    .select("id, owner_id, project_id, concept_id")
    .eq("id", jobId)
    .maybeSingle();

  if (!job) {
    return {};
  }

  const response = await fetch(result.outputUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to download fal output (${response.status}) [${correlationId}]`,
    );
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const fileName = `fal-${jobId}.mp4`;

  const asset = await persistRenderVideoAsset(supabase, {
    ownerId: job.owner_id,
    projectId: job.project_id,
    conceptId: job.concept_id,
    bytes,
    fileName,
    provider: "fal",
    mimeType: response.headers.get("content-type") ?? "video/mp4",
  });

  return { outputAssetId: asset.id };
}
