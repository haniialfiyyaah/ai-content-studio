import {
  AppError,
  ConceptContentSchema,
  CreateConceptInputSchema,
  CreateConceptRevisionInputSchema,
  ErrorCodes,
  PublishingPackSchema,
  VisualPlanSchema,
  type Concept,
  type ConceptContent,
  type ConceptVersion,
  type CreateConceptInput,
  type CreateConceptRevisionInput,
  type PublishingPack,
  type VisualPlan,
} from "@acs/schemas";
import type { z } from "zod";

/** Minimal query surface for concept services (select/eq/update/insert). */
export interface ConceptDbClient {
  from: (table: string) => any;
}

interface ConceptRow {
  id: string;
  project_id: string;
  owner_id: string;
  title: string | null;
  original_input: string | null;
  source: string | null;
  selected_for_initial_launch: boolean;
  working_version_id: string | null;
  latest_approved_version_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ConceptVersionRow {
  id: string;
  concept_id: string;
  version_number: number;
  review_status: ConceptVersion["reviewStatus"];
  content: unknown;
  brand_kit_snapshot: unknown;
  visual_plan: unknown;
  publishing_pack: unknown;
  approved_at: string | null;
  approval_revoked_at: string | null;
  created_at: string;
}

interface ProjectLockRow {
  id: string;
  owner_id: string;
  status: string;
  settings_version: number;
}

export function mapConceptRow(row: ConceptRow): Concept {
  return {
    id: row.id,
    projectId: row.project_id,
    ownerId: row.owner_id,
    title: row.title ?? "Untitled concept",
    originalInput: row.original_input,
    source: row.source ?? "web",
    selectedForInitialLaunch: row.selected_for_initial_launch,
    workingVersionId: row.working_version_id,
    latestApprovedVersionId: row.latest_approved_version_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapConceptVersionRow(row: ConceptVersionRow): ConceptVersion {
  return {
    id: row.id,
    conceptId: row.concept_id,
    versionNumber: row.version_number,
    reviewStatus: row.review_status,
    content: ConceptContentSchema.parse(row.content ?? {}),
    brandKitSnapshot: row.brand_kit_snapshot ?? null,
    visualPlan: row.visual_plan
      ? VisualPlanSchema.parse(row.visual_plan)
      : null,
    publishingPack: row.publishing_pack
      ? PublishingPackSchema.parse(row.publishing_pack)
      : null,
    approvedAt: row.approved_at,
    approvalRevokedAt: row.approval_revoked_at,
    createdAt: row.created_at,
  };
}

export interface CreateConceptWithDraftVersionParams {
  projectId: string;
  ownerId: string;
  input: z.input<typeof CreateConceptInputSchema>;
  correlationId?: string;
}

/**
 * Creates a concept plus draft version 1 and points working_version_id at it.
 * Concept insert is separate from the version so deferred FKs stay valid.
 */
export async function createConceptWithDraftVersion(
  supabase: ConceptDbClient,
  params: CreateConceptWithDraftVersionParams,
): Promise<{ concept: Concept; version: ConceptVersion }> {
  const input: CreateConceptInput = CreateConceptInputSchema.parse(params.input);

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, owner_id")
    .eq("id", params.projectId)
    .eq("owner_id", params.ownerId)
    .maybeSingle();

  if (projectError || !project) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Project not found", 404);
  }

  const { data: conceptRow, error: conceptError } = await supabase
    .from("concepts")
    .insert({
      project_id: params.projectId,
      owner_id: params.ownerId,
      title: input.title ?? "Untitled concept",
      original_input: input.originalInput ?? null,
      source: input.source,
      selected_for_initial_launch: false,
    })
    .select("*")
    .single();

  if (conceptError || !conceptRow) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to create concept",
      500,
      { correlationId: params.correlationId },
    );
  }

  const concept = conceptRow as ConceptRow;
  const content = input.content ?? ConceptContentSchema.parse({});
  const visualPlan = input.visualPlan ?? null;
  const publishingPack = input.publishingPack ?? null;

  const { data: versionRow, error: versionError } = await supabase
    .from("concept_versions")
    .insert({
      concept_id: concept.id,
      version_number: 1,
      review_status: "draft",
      content,
      brand_kit_snapshot: {},
      visual_plan: visualPlan ?? {},
      publishing_pack: publishingPack ?? {},
      created_by: params.ownerId,
    })
    .select("*")
    .single();

  if (versionError || !versionRow) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to create concept draft version",
      500,
      { correlationId: params.correlationId },
    );
  }

  const version = versionRow as ConceptVersionRow;

  const { data: updatedConcept, error: pointerError } = await supabase
    .from("concepts")
    .update({ working_version_id: version.id })
    .eq("id", concept.id)
    .eq("owner_id", params.ownerId)
    .select("*")
    .single();

  if (pointerError || !updatedConcept) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to set concept working version",
      500,
      { correlationId: params.correlationId },
    );
  }

  return {
    concept: mapConceptRow(updatedConcept as ConceptRow),
    version: mapConceptVersionRow(version),
  };
}

export interface ApproveConceptVersionParams {
  versionId: string;
  ownerId: string;
  actorId?: string;
  requestId?: string;
  correlationId?: string;
}

/**
 * Approves an exact immutable version, writes an approval event, and updates
 * latest_approved_version_id. Working pointer stays put when it already points
 * at this version (required for first-activation readiness).
 */
export async function approveConceptVersion(
  supabase: ConceptDbClient,
  params: ApproveConceptVersionParams,
): Promise<{ concept: Concept; version: ConceptVersion }> {
  const { data: versionRow, error: versionError } = await supabase
    .from("concept_versions")
    .select("*")
    .eq("id", params.versionId)
    .maybeSingle();

  if (versionError || !versionRow) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Concept version not found", 404);
  }

  const version = versionRow as ConceptVersionRow;

  const { data: conceptRow, error: conceptError } = await supabase
    .from("concepts")
    .select("*")
    .eq("id", version.concept_id)
    .eq("owner_id", params.ownerId)
    .maybeSingle();

  if (conceptError || !conceptRow) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Concept not found", 404);
  }

  const concept = conceptRow as ConceptRow;

  if (version.review_status === "approved" && !version.approval_revoked_at) {
    // Idempotent re-approve of the same live approval.
    return {
      concept: mapConceptRow(concept),
      version: mapConceptVersionRow(version),
    };
  }

  if (version.approval_revoked_at) {
    throw new AppError(
      ErrorCodes.CONCEPT_NOT_APPROVED,
      "Cannot re-approve a revoked version; create a new revision first",
      409,
    );
  }

  const approvedAt = new Date().toISOString();
  const actorId = params.actorId ?? params.ownerId;

  const { data: approvedRow, error: approveError } = await supabase
    .from("concept_versions")
    .update({
      review_status: "approved",
      approved_at: approvedAt,
      approved_by: actorId,
      approval_revoked_at: null,
    })
    .eq("id", version.id)
    .eq("concept_id", concept.id)
    .select("*")
    .single();

  if (approveError || !approvedRow) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to approve concept version",
      500,
      { correlationId: params.correlationId },
    );
  }

  await supabase.from("approval_events").insert({
    owner_id: params.ownerId,
    actor_id: actorId,
    object_type: "concept_version",
    object_id: version.id,
    version_or_attempt_id: version.id,
    event: "approved",
    request_id: params.requestId ?? params.correlationId ?? null,
  });

  // Keep working pointer consistent when approving the current working version.
  const conceptUpdate: Record<string, unknown> = {
    latest_approved_version_id: version.id,
  };
  if (concept.working_version_id === version.id) {
    conceptUpdate.working_version_id = version.id;
  }

  const { data: updatedConcept, error: pointerError } = await supabase
    .from("concepts")
    .update(conceptUpdate)
    .eq("id", concept.id)
    .eq("owner_id", params.ownerId)
    .select("*")
    .single();

  if (pointerError || !updatedConcept) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to update concept approval pointers",
      500,
      { correlationId: params.correlationId },
    );
  }

  return {
    concept: mapConceptRow(updatedConcept as ConceptRow),
    version: mapConceptVersionRow(approvedRow as ConceptVersionRow),
  };
}

export interface CreateRevisionFromApprovedParams {
  conceptId: string;
  ownerId: string;
  input?: z.input<typeof CreateConceptRevisionInputSchema>;
  correlationId?: string;
}

/**
 * Creates draft version N+1 copied from the latest approved (or current working)
 * content. Always advances working_version_id; approved history stays immutable.
 */
export async function createRevisionFromApproved(
  supabase: ConceptDbClient,
  params: CreateRevisionFromApprovedParams,
): Promise<{ concept: Concept; version: ConceptVersion }> {
  const input: CreateConceptRevisionInput =
    CreateConceptRevisionInputSchema.parse(params.input ?? {});

  const { data: conceptRow, error: conceptError } = await supabase
    .from("concepts")
    .select("*")
    .eq("id", params.conceptId)
    .eq("owner_id", params.ownerId)
    .maybeSingle();

  if (conceptError || !conceptRow) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Concept not found", 404);
  }

  const concept = conceptRow as ConceptRow;
  const sourceVersionId =
    concept.latest_approved_version_id ?? concept.working_version_id;

  if (!sourceVersionId) {
    throw new AppError(
      ErrorCodes.NOT_FOUND,
      "Concept has no version to revise from",
      404,
    );
  }

  const { data: sourceRow, error: sourceError } = await supabase
    .from("concept_versions")
    .select("*")
    .eq("id", sourceVersionId)
    .eq("concept_id", concept.id)
    .maybeSingle();

  if (sourceError || !sourceRow) {
    throw new AppError(
      ErrorCodes.NOT_FOUND,
      "Source concept version not found",
      404,
    );
  }

  const source = sourceRow as ConceptVersionRow;

  const { data: latestRows, error: latestError } = await supabase
    .from("concept_versions")
    .select("version_number")
    .eq("concept_id", concept.id)
    .order("version_number", { ascending: false })
    .limit(1);

  if (latestError) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to resolve next version number",
      500,
      { correlationId: params.correlationId },
    );
  }

  const maxVersion =
    Array.isArray(latestRows) && latestRows.length > 0
      ? (latestRows[0] as { version_number: number }).version_number
      : source.version_number;
  const nextNumber = maxVersion + 1;

  const content: ConceptContent = input.content
    ? ConceptContentSchema.parse(input.content)
    : ConceptContentSchema.parse(source.content ?? {});
  const visualPlan: VisualPlan | null = input.visualPlan
    ? VisualPlanSchema.parse(input.visualPlan)
    : source.visual_plan
      ? VisualPlanSchema.parse(source.visual_plan)
      : null;
  const publishingPack: PublishingPack | null = input.publishingPack
    ? PublishingPackSchema.parse(input.publishingPack)
    : source.publishing_pack
      ? PublishingPackSchema.parse(source.publishing_pack)
      : null;

  const { data: draftRow, error: draftError } = await supabase
    .from("concept_versions")
    .insert({
      concept_id: concept.id,
      version_number: nextNumber,
      review_status: "draft",
      content,
      brand_kit_snapshot: source.brand_kit_snapshot ?? {},
      visual_plan: visualPlan ?? {},
      publishing_pack: publishingPack ?? {},
      created_by: params.ownerId,
      supersedes_version_id: source.id,
    })
    .select("*")
    .single();

  if (draftError || !draftRow) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to create concept revision",
      500,
      { correlationId: params.correlationId },
    );
  }

  const draft = draftRow as ConceptVersionRow;
  const conceptPatch: Record<string, unknown> = {
    working_version_id: draft.id,
  };
  if (input.title) {
    conceptPatch.title = input.title;
  }

  const { data: updatedConcept, error: pointerError } = await supabase
    .from("concepts")
    .update(conceptPatch)
    .eq("id", concept.id)
    .eq("owner_id", params.ownerId)
    .select("*")
    .single();

  if (pointerError || !updatedConcept) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to advance concept working version",
      500,
      { correlationId: params.correlationId },
    );
  }

  return {
    concept: mapConceptRow(updatedConcept as ConceptRow),
    version: mapConceptVersionRow(draft),
  };
}

export interface SetInitialLaunchSelectionParams {
  projectId: string;
  ownerId: string;
  conceptIds: string[];
  expectedVersion: number;
}

/**
 * Atomically replaces the project's initial-launch selection and bumps
 * settings_version. Selection never approves concepts.
 */
export async function setInitialLaunchSelection(
  supabase: ConceptDbClient,
  params: SetInitialLaunchSelectionParams,
): Promise<{
  settingsVersion: number;
  selectedConceptIds: string[];
}> {
  const uniqueIds = [...new Set(params.conceptIds)];

  const { data: projectRow, error: projectError } = await supabase
    .from("projects")
    .select("id, owner_id, status, settings_version")
    .eq("id", params.projectId)
    .eq("owner_id", params.ownerId)
    .maybeSingle();

  if (projectError || !projectRow) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Project not found", 404);
  }

  const project = projectRow as ProjectLockRow;

  if (project.settings_version !== params.expectedVersion) {
    throw new AppError(
      ErrorCodes.VERSION_CONFLICT,
      "Project settings version conflict",
      409,
      {
        expectedVersion: params.expectedVersion,
        actualVersion: project.settings_version,
      },
    );
  }

  if (project.status !== "draft") {
    throw new AppError(
      ErrorCodes.PROJECT_NOT_ACTIONABLE,
      "Initial launch selection can only change while the project is draft",
      409,
    );
  }

  if (uniqueIds.length > 0) {
    const { data: owned, error: ownedError } = await supabase
      .from("concepts")
      .select("id")
      .eq("project_id", params.projectId)
      .eq("owner_id", params.ownerId)
      .in("id", uniqueIds);

    if (ownedError) {
      throw new AppError(
        ErrorCodes.INTERNAL_ERROR,
        "Failed to validate launch concepts",
        500,
      );
    }

    const ownedIds = new Set(
      ((owned ?? []) as Array<{ id: string }>).map((row) => row.id),
    );
    const missing = uniqueIds.filter((id) => !ownedIds.has(id));
    if (missing.length > 0) {
      throw new AppError(
        ErrorCodes.NOT_FOUND,
        "One or more concepts were not found on this project",
        404,
        { missing },
      );
    }
  }

  // Clear previous selection for the project, then mark the new set.
  const { error: clearError } = await supabase
    .from("concepts")
    .update({ selected_for_initial_launch: false })
    .eq("project_id", params.projectId)
    .eq("owner_id", params.ownerId)
    .eq("selected_for_initial_launch", true);

  if (clearError) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to clear initial launch selection",
      500,
    );
  }

  if (uniqueIds.length > 0) {
    const { error: selectError } = await supabase
      .from("concepts")
      .update({ selected_for_initial_launch: true })
      .eq("project_id", params.projectId)
      .eq("owner_id", params.ownerId)
      .in("id", uniqueIds);

    if (selectError) {
      throw new AppError(
        ErrorCodes.INTERNAL_ERROR,
        "Failed to set initial launch selection",
        500,
      );
    }
  }

  const nextVersion = project.settings_version + 1;
  const { data: updatedProject, error: bumpError } = await supabase
    .from("projects")
    .update({ settings_version: nextVersion })
    .eq("id", params.projectId)
    .eq("owner_id", params.ownerId)
    .eq("settings_version", params.expectedVersion)
    .select("settings_version")
    .single();

  if (bumpError || !updatedProject) {
    throw new AppError(
      ErrorCodes.VERSION_CONFLICT,
      "Project settings version conflict",
      409,
    );
  }

  return {
    settingsVersion: (updatedProject as { settings_version: number })
      .settings_version,
    selectedConceptIds: uniqueIds,
  };
}
