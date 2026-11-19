import {
  AppError,
  ErrorCodes,
  mapConceptRow,
  mapConceptVersionRow,
} from "@acs/domain";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/concepts/[id] — concept detail with working + approved versions.
 */
export async function GET(
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

    const { data: conceptRow, error: conceptError } = await supabase
      .from("concepts")
      .select("*")
      .eq("id", conceptId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (conceptError || !conceptRow) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Concept not found", 404);
    }

    const concept = mapConceptRow(conceptRow as never);

    const { data: versionRows, error: versionsError } = await supabase
      .from("concept_versions")
      .select("*")
      .eq("concept_id", conceptId)
      .order("version_number", { ascending: false });

    if (versionsError) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, versionsError.message, 500);
    }

    const versions = (versionRows ?? []).map((row) =>
      mapConceptVersionRow(row as never),
    );
    const workingVersion =
      versions.find((v) => v.id === concept.workingVersionId) ?? null;
    const latestApprovedVersion =
      versions.find((v) => v.id === concept.latestApprovedVersionId) ?? null;

    return jsonOk(
      {
        concept,
        workingVersion,
        latestApprovedVersion,
        versions,
      },
      correlationId,
    );
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
