import {
  AppError,
  CreateGrantInputSchema,
  ErrorCodes,
  type AuthorizationGrant,
  type AuthorizationScope,
  type CreateGrantInput,
} from "@acs/schemas";
import type { z } from "zod";

/** Minimal query surface for grant services. */
export interface GrantDbClient {
  from: (table: string) => any;
}

interface GrantRow {
  id: string;
  owner_id: string;
  actor_id: string | null;
  scope: AuthorizationScope;
  project_id: string | null;
  destination_id: string | null;
  limit_amount: number | string | null;
  currency: string | null;
  valid_from: string;
  valid_until: string | null;
  revoked_at: string | null;
  policy_version: string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
}

export function mapGrantRow(row: GrantRow): AuthorizationGrant {
  const limitAmount =
    row.limit_amount === null || row.limit_amount === undefined
      ? null
      : Number(row.limit_amount);

  return {
    id: row.id,
    ownerId: row.owner_id,
    actorId: row.actor_id,
    scope: row.scope,
    projectId: row.project_id,
    destinationId: row.destination_id,
    limitAmount: Number.isFinite(limitAmount) ? limitAmount : null,
    currency: row.currency,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    revokedAt: row.revoked_at,
    policyVersion: row.policy_version,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateGrantParams {
  projectId: string;
  ownerId: string;
  actorId?: string;
  input: z.input<typeof CreateGrantInputSchema>;
  correlationId?: string;
}

/**
 * Creates an authorization / spend grant scoped to a project (and optional destination).
 * Activation does not imply paid-media or publish grants — those are explicit here.
 */
export async function createGrant(
  supabase: GrantDbClient,
  params: CreateGrantParams,
): Promise<AuthorizationGrant> {
  const input: CreateGrantInput = CreateGrantInputSchema.parse(params.input);
  const actorId = params.actorId ?? params.ownerId;

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, owner_id")
    .eq("id", params.projectId)
    .eq("owner_id", params.ownerId)
    .maybeSingle();

  if (projectError || !project) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Project not found", 404);
  }

  if (input.scope === "publish_destination" && !input.destinationId) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      "publish_destination grants require destinationId",
      400,
    );
  }

  if (input.destinationId) {
    const { data: account, error: accountError } = await supabase
      .from("connected_accounts")
      .select("id")
      .eq("id", input.destinationId)
      .eq("owner_id", params.ownerId)
      .maybeSingle();

    if (accountError || !account) {
      throw new AppError(
        ErrorCodes.NOT_FOUND,
        "Connected account (destination) not found",
        404,
      );
    }
  }

  const now = new Date().toISOString();

  const { data: row, error } = await supabase
    .from("authorization_grants")
    .insert({
      owner_id: params.ownerId,
      actor_id: actorId,
      scope: input.scope,
      project_id: params.projectId,
      destination_id: input.destinationId ?? null,
      limit_amount: input.limitAmount ?? null,
      currency: input.currency ?? null,
      valid_from: now,
      valid_until: input.validUntil ?? null,
      metadata: input.metadata ?? {},
    })
    .select("*")
    .single();

  if (error || !row) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to create authorization grant",
      500,
      { correlationId: params.correlationId },
    );
  }

  await supabase.from("audit_events").insert({
    owner_id: params.ownerId,
    actor_type: "user",
    actor_id: actorId,
    action: "authorization_grant.created",
    target_type: "authorization_grant",
    target_id: (row as GrantRow).id,
    after_summary: {
      scope: input.scope,
      projectId: params.projectId,
      destinationId: input.destinationId ?? null,
      limitAmount: input.limitAmount ?? null,
      currency: input.currency ?? null,
    },
    correlation_id: params.correlationId ?? null,
    source_surface: "web",
  });

  return mapGrantRow(row as GrantRow);
}
