import {
  AppError,
  CreateProjectInputSchema,
  ErrorCodes,
  type Project,
} from "@acs/schemas";
import type { z } from "zod";

/** Input shape before Zod defaults (name required; mode/timezone optional). */
type CreateProjectInputArg = z.input<typeof CreateProjectInputSchema>;

/** Minimal Supabase surface used by domain services (avoids hard coupling). */
export interface DbClient {
  from: (table: string) => {
    insert: (values: Record<string, unknown> | Record<string, unknown>[]) => {
      select: (columns?: string) => {
        single: () => PromiseLike<{ data: unknown; error: { message: string } | null }>;
      };
    };
    upsert: (
      values: Record<string, unknown> | Record<string, unknown>[],
      options?: { onConflict?: string; ignoreDuplicates?: boolean },
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
}

/** Snake_case project row as returned by PostgREST. */
interface ProjectRow {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  objective: string | null;
  content_mode: Project["contentMode"];
  status: Project["status"];
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

export function mapProjectRow(row: ProjectRow): Project {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    description: row.description,
    objective: row.objective,
    contentMode: row.content_mode,
    status: row.status,
    timezone: row.timezone,
    defaultProductionMode: row.default_production_mode,
    defaultModelId: row.default_model_id,
    preferredDestinations: row.preferred_destinations,
    creativeContextVersion: row.creative_context_version,
    settingsVersion: row.settings_version,
    activatedAt: row.activated_at,
    pausedAt: row.paused_at,
    stoppedAt: row.stopped_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateDraftProjectParams {
  ownerId: string;
  input: CreateProjectInputArg;
  correlationId?: string;
}

/**
 * Creates a draft project and ensures per-owner AI prefs/policy rows exist.
 * Prefs/policy upserts ignore conflicts so concurrent creates stay idempotent.
 */
export async function createDraftProject(
  supabase: DbClient,
  params: CreateDraftProjectParams,
): Promise<Project> {
  const input = CreateProjectInputSchema.parse(params.input);

  const { data, error } = await supabase
    .from("projects")
    .insert({
      owner_id: params.ownerId,
      name: input.name,
      description: input.description ?? null,
      objective: input.objective ?? null,
      content_mode: input.contentMode,
      timezone: input.timezone,
      default_production_mode: input.defaultProductionMode,
      status: "draft",
    })
    .select("*")
    .single();

  if (error || !data) {
    // Avoid logging correlation payloads that might contain user prompts.
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to create draft project",
      500,
      { correlationId: params.correlationId },
    );
  }

  // Seed defaults if the owner has never configured AI settings.
  await supabase.from("ai_provider_preferences").upsert(
    {
      owner_id: params.ownerId,
      openai_mode: "managed",
      preferred_model_id: null,
      version: 1,
    },
    { onConflict: "owner_id", ignoreDuplicates: true },
  );

  await supabase.from("ai_usage_policy").upsert(
    {
      owner_id: params.ownerId,
      managed_monthly_allowance: 0,
      managed_used: 0,
      currency: "USD",
    },
    { onConflict: "owner_id", ignoreDuplicates: true },
  );

  return mapProjectRow(data as ProjectRow);
}
