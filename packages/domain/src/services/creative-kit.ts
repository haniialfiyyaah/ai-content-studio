import {
  AppError,
  CreateCreativeKitInputSchema,
  ErrorCodes,
  type CreateCreativeKitInput,
  type CreativeKit,
} from "@acs/schemas";
import type { z } from "zod";

/** Minimal query surface for Creative Kit services. */
export interface CreativeKitDbClient {
  from: (table: string) => any;
}

interface BrandKitRow {
  id: string;
  project_id: string;
  version: number;
  language_default: string | null;
  tone: string | null;
  audience: string | null;
  brand_or_creator_name: string | null;
  do_say: unknown;
  dont_say: unknown;
  visual_notes: string | null;
  brand_asset_ids: unknown;
  reference_profile_ids: unknown;
  generation_defaults: unknown;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function mapCreativeKitRow(row: BrandKitRow): CreativeKit {
  return {
    id: row.id,
    projectId: row.project_id,
    version: row.version,
    languageDefault: row.language_default,
    tone: row.tone,
    audience: row.audience,
    brandOrCreatorName: row.brand_or_creator_name,
    doSay: Array.isArray(row.do_say) ? row.do_say : [],
    dontSay: Array.isArray(row.dont_say) ? row.dont_say : [],
    visualNotes: row.visual_notes,
    brandAssetIds: Array.isArray(row.brand_asset_ids) ? row.brand_asset_ids : [],
    referenceProfileIds: Array.isArray(row.reference_profile_ids)
      ? row.reference_profile_ids
      : [],
    generationDefaults:
      row.generation_defaults &&
      typeof row.generation_defaults === "object" &&
      !Array.isArray(row.generation_defaults)
        ? (row.generation_defaults as Record<string, unknown>)
        : {},
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface GetLatestKitParams {
  projectId: string;
  ownerId: string;
}

/**
 * Returns the highest-version Creative Kit for an owned project, or null.
 */
export async function getLatestKit(
  supabase: CreativeKitDbClient,
  params: GetLatestKitParams,
): Promise<CreativeKit | null> {
  await assertOwnedProject(supabase, params.projectId, params.ownerId);

  const { data, error } = await supabase
    .from("project_brand_kits")
    .select("*")
    .eq("project_id", params.projectId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to load Creative Kit",
      500,
    );
  }

  if (!data) {
    return null;
  }

  return mapCreativeKitRow(data as BrandKitRow);
}

export interface CreateKitVersionParams {
  projectId: string;
  ownerId: string;
  actorId?: string;
  input?: z.input<typeof CreateCreativeKitInputSchema>;
  /** When true, copies fields from the previous version before applying input. */
  inheritPrevious?: boolean;
  correlationId?: string;
}

/**
 * Inserts the next immutable Creative Kit version and bumps creative_context_version.
 */
export async function createKitVersion(
  supabase: CreativeKitDbClient,
  params: CreateKitVersionParams,
): Promise<CreativeKit> {
  const input: CreateCreativeKitInput = CreateCreativeKitInputSchema.parse(
    params.input ?? {},
  );
  const actorId = params.actorId ?? params.ownerId;

  await assertOwnedProject(supabase, params.projectId, params.ownerId);

  const previous = await loadLatestKitRow(supabase, params.projectId);
  const nextVersion = previous ? previous.version + 1 : 1;
  const inherit = params.inheritPrevious !== false;

  const base = inherit && previous ? previous : null;

  const { data: row, error } = await supabase
    .from("project_brand_kits")
    .insert({
      project_id: params.projectId,
      version: nextVersion,
      language_default:
        input.languageDefault !== undefined
          ? input.languageDefault
          : (base?.language_default ?? null),
      tone: input.tone !== undefined ? input.tone : (base?.tone ?? null),
      audience:
        input.audience !== undefined ? input.audience : (base?.audience ?? null),
      brand_or_creator_name:
        input.brandOrCreatorName !== undefined
          ? input.brandOrCreatorName
          : (base?.brand_or_creator_name ?? null),
      do_say: input.doSay ?? (base?.do_say ?? []),
      dont_say: input.dontSay ?? (base?.dont_say ?? []),
      visual_notes:
        input.visualNotes !== undefined
          ? input.visualNotes
          : (base?.visual_notes ?? null),
      brand_asset_ids: input.brandAssetIds ?? (base?.brand_asset_ids ?? []),
      reference_profile_ids:
        input.referenceProfileIds ?? (base?.reference_profile_ids ?? []),
      generation_defaults:
        input.generationDefaults ?? (base?.generation_defaults ?? {}),
      created_by: actorId,
    })
    .select("*")
    .single();

  if (error || !row) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to create Creative Kit version",
      500,
      { correlationId: params.correlationId },
    );
  }

  // Keep project pointer aligned with the latest kit version.
  const { error: bumpError } = await supabase
    .from("projects")
    .update({ creative_context_version: nextVersion })
    .eq("id", params.projectId)
    .eq("owner_id", params.ownerId);

  if (bumpError) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to bump creative context version",
      500,
      { correlationId: params.correlationId },
    );
  }

  return mapCreativeKitRow(row as BrandKitRow);
}

async function assertOwnedProject(
  supabase: CreativeKitDbClient,
  projectId: string,
  ownerId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error || !data) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Project not found", 404);
  }
}

async function loadLatestKitRow(
  supabase: CreativeKitDbClient,
  projectId: string,
): Promise<BrandKitRow | null> {
  const { data, error } = await supabase
    .from("project_brand_kits")
    .select("*")
    .eq("project_id", projectId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to load previous Creative Kit",
      500,
    );
  }

  return (data as BrandKitRow | null) ?? null;
}
