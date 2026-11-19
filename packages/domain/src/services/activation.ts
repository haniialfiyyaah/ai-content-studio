import {
  AppError,
  ErrorCodes,
  type Project,
  type ProjectStatus,
} from "@acs/schemas";
import {
  assertInitialLaunchReady,
  type LaunchConceptCheck,
} from "../activation";
import { assertProjectTransition } from "../project-transitions";
import { mapProjectRow } from "./projects";

/** Query surface for activation lifecycle services. */
export interface ActivationDbClient {
  from: (table: string) => any;
}

interface ProjectRow {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  objective: string | null;
  content_mode: Project["contentMode"];
  status: ProjectStatus;
  timezone: string;
  default_production_mode: Project["defaultProductionMode"];
  default_model_id: string | null;
  preferred_destinations: unknown;
  creative_context_version: number;
  settings_version: number;
  activated_at: string | null;
  paused_at: string | null;
  stopped_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SelectedConceptRow {
  id: string;
  selected_for_initial_launch: boolean;
  working_version_id: string | null;
  latest_approved_version_id: string | null;
}

interface VersionStatusRow {
  id: string;
  concept_id: string;
  review_status: string;
  approval_revoked_at: string | null;
}

export interface ActivateProjectParams {
  projectId: string;
  ownerId: string;
  expectedVersion: number;
  actorId?: string;
  correlationId?: string;
}

export interface ActivateProjectResult {
  project: Project;
  launchSnapshot: { conceptId: string; approvedVersionId: string }[];
}

/**
 * First activation (draft → active). Validates the initial-launch set, writes
 * an activate_project grant + audit snapshot, and bumps settings_version.
 * Does not create video jobs or publish grants.
 */
export async function activateProject(
  supabase: ActivationDbClient,
  params: ActivateProjectParams,
): Promise<ActivateProjectResult> {
  const project = await loadOwnedProject(
    supabase,
    params.projectId,
    params.ownerId,
  );

  if (project.settings_version !== params.expectedVersion) {
    throw versionConflict(params.expectedVersion, project.settings_version);
  }

  assertProjectTransition(project.status, "active");

  if (project.status !== "draft") {
    throw new AppError(
      ErrorCodes.PROJECT_NOT_ACTIONABLE,
      "Use resume for paused/stopped projects; activate is for first launch only",
      409,
    );
  }

  const launchChecks = await loadLaunchConceptChecks(
    supabase,
    params.projectId,
    params.ownerId,
  );
  const launchSnapshot = assertInitialLaunchReady(launchChecks);

  const now = new Date().toISOString();
  const nextVersion = project.settings_version + 1;
  const actorId = params.actorId ?? params.ownerId;

  const { data: updatedRow, error: updateError } = await supabase
    .from("projects")
    .update({
      status: "active",
      activated_at: now,
      paused_at: null,
      stopped_at: null,
      settings_version: nextVersion,
    })
    .eq("id", params.projectId)
    .eq("owner_id", params.ownerId)
    .eq("settings_version", params.expectedVersion)
    .eq("status", "draft")
    .select("*")
    .single();

  if (updateError || !updatedRow) {
    throw versionConflict(params.expectedVersion, project.settings_version);
  }

  await supabase.from("authorization_grants").insert({
    owner_id: params.ownerId,
    actor_id: actorId,
    scope: "activate_project",
    project_id: params.projectId,
    valid_from: now,
    metadata: {
      launchSnapshot,
      settingsVersion: nextVersion,
    },
  });

  await supabase.from("audit_events").insert({
    owner_id: params.ownerId,
    actor_type: "user",
    actor_id: actorId,
    action: "project.activated",
    target_type: "project",
    target_id: params.projectId,
    before_summary: {
      status: project.status,
      settingsVersion: project.settings_version,
    },
    after_summary: {
      status: "active",
      settingsVersion: nextVersion,
      launchSnapshot,
    },
    correlation_id: params.correlationId ?? null,
    source_surface: "web",
  });

  return {
    project: mapProjectRow(updatedRow as ProjectRow),
    launchSnapshot,
  };
}

export interface LifecycleProjectParams {
  projectId: string;
  ownerId: string;
  expectedVersion: number;
  actorId?: string;
  correlationId?: string;
}

/** active → paused */
export async function pauseProject(
  supabase: ActivationDbClient,
  params: LifecycleProjectParams,
): Promise<Project> {
  return transitionProject(supabase, params, "paused", {
    paused_at: new Date().toISOString(),
  });
}

/**
 * paused|stopped → active. Does not re-run the initial-launch gate.
 */
export async function resumeProject(
  supabase: ActivationDbClient,
  params: LifecycleProjectParams,
): Promise<Project> {
  return transitionProject(supabase, params, "active", {
    activated_at: new Date().toISOString(),
    paused_at: null,
    stopped_at: null,
  });
}

/** active|paused → stopped */
export async function stopProject(
  supabase: ActivationDbClient,
  params: LifecycleProjectParams,
): Promise<Project> {
  return transitionProject(supabase, params, "stopped", {
    stopped_at: new Date().toISOString(),
    paused_at: null,
  });
}

async function transitionProject(
  supabase: ActivationDbClient,
  params: LifecycleProjectParams,
  toStatus: ProjectStatus,
  extraFields: Record<string, unknown>,
): Promise<Project> {
  const project = await loadOwnedProject(
    supabase,
    params.projectId,
    params.ownerId,
  );

  if (project.settings_version !== params.expectedVersion) {
    throw versionConflict(params.expectedVersion, project.settings_version);
  }

  assertProjectTransition(project.status, toStatus);

  const nextVersion = project.settings_version + 1;
  const actorId = params.actorId ?? params.ownerId;
  const action = `project.${toStatus === "active" ? "resumed" : toStatus}`;

  const { data: updatedRow, error } = await supabase
    .from("projects")
    .update({
      status: toStatus,
      settings_version: nextVersion,
      ...extraFields,
    })
    .eq("id", params.projectId)
    .eq("owner_id", params.ownerId)
    .eq("settings_version", params.expectedVersion)
    .eq("status", project.status)
    .select("*")
    .single();

  if (error || !updatedRow) {
    throw versionConflict(params.expectedVersion, project.settings_version);
  }

  await supabase.from("audit_events").insert({
    owner_id: params.ownerId,
    actor_type: "user",
    actor_id: actorId,
    action,
    target_type: "project",
    target_id: params.projectId,
    before_summary: {
      status: project.status,
      settingsVersion: project.settings_version,
    },
    after_summary: {
      status: toStatus,
      settingsVersion: nextVersion,
    },
    correlation_id: params.correlationId ?? null,
    source_surface: "web",
  });

  return mapProjectRow(updatedRow as ProjectRow);
}

async function loadOwnedProject(
  supabase: ActivationDbClient,
  projectId: string,
  ownerId: string,
): Promise<ProjectRow> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error || !data) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Project not found", 404);
  }

  return data as ProjectRow;
}

async function loadLaunchConceptChecks(
  supabase: ActivationDbClient,
  projectId: string,
  ownerId: string,
): Promise<LaunchConceptCheck[]> {
  const { data: conceptRows, error: conceptError } = await supabase
    .from("concepts")
    .select(
      "id, selected_for_initial_launch, working_version_id, latest_approved_version_id",
    )
    .eq("project_id", projectId)
    .eq("owner_id", ownerId)
    .eq("selected_for_initial_launch", true);

  if (conceptError) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to load initial launch concepts",
      500,
    );
  }

  const concepts = (conceptRows ?? []) as SelectedConceptRow[];
  if (concepts.length === 0) {
    return [];
  }

  const workingIds = concepts
    .map((c) => c.working_version_id)
    .filter((id): id is string => Boolean(id));

  let versionsById = new Map<string, VersionStatusRow>();
  if (workingIds.length > 0) {
    const { data: versionRows, error: versionError } = await supabase
      .from("concept_versions")
      .select("id, concept_id, review_status, approval_revoked_at")
      .in("id", workingIds);

    if (versionError) {
      throw new AppError(
        ErrorCodes.INTERNAL_ERROR,
        "Failed to load concept versions for activation",
        500,
      );
    }

    versionsById = new Map(
      ((versionRows ?? []) as VersionStatusRow[]).map((row) => [row.id, row]),
    );
  }

  return concepts.map((concept) => {
    const working = concept.working_version_id
      ? versionsById.get(concept.working_version_id)
      : undefined;

    return {
      conceptId: concept.id,
      selectedForInitialLaunch: concept.selected_for_initial_launch,
      workingVersionId: concept.working_version_id,
      workingReviewStatus: working?.review_status ?? null,
      workingApprovalRevokedAt: working?.approval_revoked_at ?? null,
      workingVersionBelongsToConcept: Boolean(
        working && working.concept_id === concept.id,
      ),
    };
  });
}

function versionConflict(expected: number, actual: number): AppError {
  return new AppError(
    ErrorCodes.VERSION_CONFLICT,
    "Project settings version conflict",
    409,
    { expectedVersion: expected, actualVersion: actual },
  );
}

/**
 * Pure helper: maps UI/API lifecycle action names to target status.
 * Useful for client enablement without importing transition tables twice.
 */
export function targetStatusForLifecycleAction(
  action: "activate" | "pause" | "resume" | "stop",
): ProjectStatus {
  switch (action) {
    case "activate":
    case "resume":
      return "active";
    case "pause":
      return "paused";
    case "stop":
      return "stopped";
  }
}
