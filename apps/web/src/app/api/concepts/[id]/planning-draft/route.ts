import { AppError, ErrorCodes } from "@acs/domain";
import { ConceptContentSchema, VisualPlanSchema, PublishingPackSchema } from "@acs/schemas";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/concepts/[id]/planning-draft
 * Fills an empty draft version with structured fixture content.
 * Refuses when a script already exists or the version is approved.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const correlationId = crypto.randomUUID();

  try {
    const { id: conceptId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new AppError(ErrorCodes.UNAUTHENTICATED, "Not signed in", 401);
    }

    const { data: concept, error: conceptError } = await supabase
      .from("concepts")
      .select("id, title, original_input, working_version_id")
      .eq("id", conceptId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (conceptError || !concept?.working_version_id) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Concept not found", 404);
    }

    const { data: version, error: versionError } = await supabase
      .from("concept_versions")
      .select("id, review_status, content")
      .eq("id", concept.working_version_id)
      .maybeSingle();

    if (versionError || !version) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Working version not found", 404);
    }

    if (version.review_status === "approved") {
      throw new AppError(
        ErrorCodes.VERSION_CONFLICT,
        "Approved versions are immutable. Create an edit revision first.",
        409,
      );
    }

    const existing = ConceptContentSchema.parse(version.content ?? {});
    if (existing.script?.trim()) {
      throw new AppError(
        ErrorCodes.VERSION_CONFLICT,
        "Script already exists. Edit it instead of replacing it.",
        409,
      );
    }

    const idea =
      concept.original_input?.trim() ||
      concept.title?.trim() ||
      "Untitled idea";
    const content = ConceptContentSchema.parse({
      hook: idea.slice(0, 180),
      script: `Fixture planning draft.\n\n${idea}\n\nThis text was filled locally so the concept can be reviewed. It is not a live model result.`,
      locale: "en",
      notes: "Fixture-generated planning draft.",
      scenes: [
        {
          id: "scene-1",
          title: "Open",
          narration: idea.slice(0, 240),
          visualDirection: "Wide establishing shot",
          durationMs: 3000,
        },
        {
          id: "scene-2",
          title: "Point",
          narration: "State the main idea in one sentence.",
          visualDirection: "Medium shot with caption",
          durationMs: 3000,
        },
      ],
    });
    const visualPlan = VisualPlanSchema.parse({
      productionMode: "remotion",
      aspectRatio: "16:9",
      captionStyle: "lower-third",
      scenes: [
        {
          sceneId: "scene-1",
          shotType: "wide",
          motion: "slow push",
          caption: "Open",
          assets: [],
        },
        {
          sceneId: "scene-2",
          shotType: "medium",
          motion: "hold",
          caption: "Point",
          assets: [],
        },
      ],
    });
    const publishingPack = PublishingPackSchema.parse({
      title: concept.title ?? "Draft",
      description: idea.slice(0, 300),
      tags: ["draft", "fixture"],
      locale: "en",
      platforms: {},
    });

    const { error: updateError } = await supabase
      .from("concept_versions")
      .update({
        content,
        visual_plan: visualPlan,
        publishing_pack: publishingPack,
      })
      .eq("id", version.id);

    if (updateError) {
      throw new AppError(
        ErrorCodes.INTERNAL_ERROR,
        "Failed to fill planning draft",
        500,
      );
    }

    return jsonOk(
      { conceptId, versionId: version.id, fixture: true },
      correlationId,
    );
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
