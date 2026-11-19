import {
  AWAITING_BROWSER_RENDER,
  AppError,
  ErrorCodes,
  claimVideoJob,
  progressVideoJob,
  resolveRemotionRenderBackend,
} from "@acs/domain";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const PrepareBodySchema = z.object({
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
});

/**
 * POST /api/video-jobs/[id]/browser-render/prepare
 * Session-authenticated: claim (if needed) and mark awaiting browser export.
 * Does not produce an MP4 and does not mark ready_for_review.
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

    const backend = resolveRemotionRenderBackend();
    if (backend !== "browser") {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        `Browser prepare is only valid when ACS_REMOTION_RENDER_BACKEND=browser (current: ${backend})`,
        409,
        { backend },
      );
    }

    const body = PrepareBodySchema.parse(
      await request.json().catch(() => ({})),
    );

    const { data: ownedJob, error: ownedError } = await supabase
      .from("video_jobs")
      .select("id, owner_id, concept_id, concept_version_id, status, production_mode")
      .eq("id", jobId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (ownedError || !ownedJob) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Video job not found", 404);
    }

    if (ownedJob.production_mode !== "remotion") {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        "Browser Remotion export requires productionMode=remotion",
        409,
        { productionMode: ownedJob.production_mode },
      );
    }

    const admin = createAdminClient();
    await claimVideoJob(admin, { jobId: ownedJob.id });

    const progressed = await progressVideoJob(admin, {
      jobId: ownedJob.id,
      stage: "render_remotion",
      state: "running",
      message: AWAITING_BROWSER_RENDER,
      correlationId,
    });

    await admin
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
        provider_request_id: `browser:pending:${ownedJob.id}`,
      })
      .eq("id", progressed.attempt.id);

    // Load concept content for composition props when scenes not provided.
    let title = body.title ?? "Content Studio render";
    let scenes = body.scenes ?? [];

    if (scenes.length === 0 || !body.title) {
      const { data: version } = await admin
        .from("concept_versions")
        .select("content")
        .eq("id", ownedJob.concept_version_id)
        .maybeSingle();

      const content = version?.content as
        | {
            hook?: string;
            scenes?: Array<{ narration?: string; title?: string }>;
          }
        | null
        | undefined;

      if (!body.title && content?.hook) {
        title = content.hook.slice(0, 200);
      }
      if (scenes.length === 0 && content?.scenes?.length) {
        scenes = content.scenes.slice(0, 3).map((s) => ({
          caption: s.title ?? s.narration ?? undefined,
          narration: s.narration,
        }));
      }
    }

    return jsonOk(
      {
        jobId: ownedJob.id,
        attemptId: progressed.attempt.id,
        conceptId: ownedJob.concept_id,
        awaitingBrowser: true,
        backend: "browser" as const,
        composition: {
          title,
          scenes,
          width: 854,
          height: 480,
          fps: 24,
        },
        message: AWAITING_BROWSER_RENDER,
      },
      correlationId,
    );
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
