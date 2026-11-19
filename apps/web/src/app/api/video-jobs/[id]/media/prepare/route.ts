import {
  AppError,
  ErrorCodes,
  prepareProductionMedia,
} from "@acs/domain";
import { ACS_FAL_DEMO_MODEL } from "@acs/integrations";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const BodySchema = z.object({
  title: z.string().max(200).optional(),
  prompt: z.string().max(4000).optional(),
  narrationText: z.string().max(5000).optional(),
  includeFootage: z.boolean().optional(),
  includeNarration: z.boolean().optional(),
  falModel: z.string().max(200).optional(),
});

/**
 * POST /api/video-jobs/[id]/media/prepare
 * Resolves fal footage + ElevenLabs narration for Remotion (fixture by default).
 * Does not spend provider credits while ACS_*_FIXTURE_MODE !== false.
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

    const body = BodySchema.parse(await request.json().catch(() => ({})));

    const { data: ownedJob, error: ownedError } = await supabase
      .from("video_jobs")
      .select(
        "id, owner_id, project_id, concept_id, concept_version_id, production_mode",
      )
      .eq("id", jobId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (ownedError || !ownedJob) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Video job not found", 404);
    }

    const admin = createAdminClient();
    const { data: version } = await admin
      .from("concept_versions")
      .select("content")
      .eq("id", ownedJob.concept_version_id)
      .maybeSingle();

    const content = (version?.content ?? {}) as {
      hook?: string;
      script?: string;
      scenes?: Array<{ narration?: string; title?: string }>;
    };

    const narrationText =
      body.narrationText?.trim() ||
      content.script?.trim() ||
      content.scenes
        ?.map((s) => s.narration || s.title || "")
        .filter(Boolean)
        .join(". ") ||
      content.hook ||
      "Welcome to AI Content Studio.";

    const title =
      body.title?.trim() || content.hook?.trim() || "Content Studio render";
    const prompt =
      body.prompt?.trim() ||
      `${title}. Short cinematic B-roll, clean lighting, 16:9.`;

    const falFixtureMode = process.env.ACS_FAL_FIXTURE_MODE !== "false";
    const elevenLabsFixtureMode =
      process.env.ACS_ELEVENLABS_FIXTURE_MODE !== "false";

    const bundle = await prepareProductionMedia({
      ownerId: ownedJob.owner_id,
      projectId: ownedJob.project_id,
      conceptId: ownedJob.concept_id,
      jobId: ownedJob.id,
      title,
      prompt,
      narrationText,
      includeFootage: body.includeFootage,
      includeNarration: body.includeNarration,
      falModel: body.falModel ?? ACS_FAL_DEMO_MODEL,
      falFixtureMode,
      elevenLabsFixtureMode,
      falApiKey: process.env.FAL_KEY ?? null,
      elevenLabsApiKey: process.env.ELEVENLABS_API_KEY ?? null,
      elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID ?? undefined,
    });

    // Upload live TTS bytes to private storage and swap to a signed URL.
    let narrationUrl = bundle.narrationUrl;
    if (bundle.narration?.audioBase64) {
      const bytes = Buffer.from(bundle.narration.audioBase64, "base64");
      const path = `${ownedJob.owner_id}/${ownedJob.project_id}/narration-${ownedJob.id}.mp3`;
      const { error: uploadError } = await admin.storage
        .from("renders")
        .upload(path, bytes, { contentType: "audio/mpeg", upsert: true });

      if (uploadError) {
        bundle.failures.push(`Narration upload failed: ${uploadError.message}`);
      } else {
        const { data: signed } = await admin.storage
          .from("renders")
          .createSignedUrl(path, 3600);
        narrationUrl = signed?.signedUrl ?? null;
      }
    }

    // Strip base64 from response.
    const narrationSafe = bundle.narration
      ? {
          fixture: bundle.narration.fixture,
          providerRequestId: bundle.narration.providerRequestId,
          model: bundle.narration.model,
          estimatedCost: bundle.narration.estimatedCost,
          characters: bundle.narration.characters,
          status: bundle.narration.status,
        }
      : null;

    await admin
      .from("video_attempts")
      .update({
        error_details: {
          productionMedia: {
            footageUrl: bundle.footageUrl,
            narrationUrl,
            narrationDurationMs: bundle.narrationDurationMs,
            fal: bundle.fal,
            narration: narrationSafe,
            failures: bundle.failures,
            preparedAt: new Date().toISOString(),
          },
        },
      })
      .eq("video_job_id", ownedJob.id);

    return jsonOk(
      {
        jobId: ownedJob.id,
        footageUrl: bundle.footageUrl,
        narrationUrl,
        narrationDurationMs: bundle.narrationDurationMs,
        fal: bundle.fal,
        narration: narrationSafe,
        costEstimateUsd: bundle.costEstimateUsd,
        failures: bundle.failures,
        fixtureMode: {
          fal: falFixtureMode,
          elevenLabs: elevenLabsFixtureMode,
        },
        message:
          falFixtureMode && elevenLabsFixtureMode
            ? "Fixture media bundle ready (sample CORS footage + narration). No paid provider calls."
            : "Media bundle prepared. Check fixtureMode flags before assuming spend.",
      },
      correlationId,
    );
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
