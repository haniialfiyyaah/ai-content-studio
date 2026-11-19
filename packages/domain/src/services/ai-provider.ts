import {
  decryptSecret,
  encryptSecret,
  fingerprintKey,
  last4,
} from "@acs/integrations";
import {
  AppError,
  AiProviderConnectionPublicSchema,
  AiProviderPreferencesSchema,
  ConnectOpenAiKeySchema,
  ErrorCodes,
  SetAiModeSchema,
  type AiProviderConnectionPublic,
  type AiProviderPreferences,
  type OpenAiMode,
} from "@acs/schemas";
import type { z } from "zod";

/** Minimal query surface for AI provider preference services. */
export interface AiProviderDbClient {
  from: (table: string) => any;
}

interface PrefsRow {
  owner_id: string;
  openai_mode: OpenAiMode;
  preferred_model_id: string | null;
  version: number;
  updated_at: string;
}

interface ConnectionRow {
  id: string;
  owner_id: string;
  provider: "openai";
  secret_reference: string;
  key_fingerprint: string | null;
  last4: string | null;
  status: AiProviderConnectionPublic["status"];
  verified_at: string | null;
  last_error_code: string | null;
  rotated_at: string | null;
}

interface UsagePolicyRow {
  owner_id: string;
  managed_monthly_allowance: number | string;
  managed_used: number | string;
  currency: string;
  period_start: string | null;
  period_end: string | null;
}

interface UsageEventRow {
  id: string;
  mode: OpenAiMode;
  model_id: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  estimated_cost: number | string | null;
  request_id: string | null;
  created_at: string;
}

function mapPrefs(row: PrefsRow): AiProviderPreferences {
  return AiProviderPreferencesSchema.parse({
    ownerId: row.owner_id,
    openaiMode: row.openai_mode,
    preferredModelId: row.preferred_model_id,
    version: row.version,
    updatedAt: row.updated_at,
  });
}

function mapConnectionPublic(row: ConnectionRow): AiProviderConnectionPublic {
  return AiProviderConnectionPublicSchema.parse({
    id: row.id,
    provider: "openai",
    last4: row.last4,
    keyFingerprint: row.key_fingerprint,
    status: row.status,
    verifiedAt: row.verified_at,
    lastErrorCode: row.last_error_code,
    rotatedAt: row.rotated_at,
  });
}

async function ensurePrefs(
  supabase: AiProviderDbClient,
  ownerId: string,
): Promise<PrefsRow> {
  const { data: existing } = await supabase
    .from("ai_provider_preferences")
    .select("*")
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (existing) return existing as PrefsRow;

  const { data: created, error } = await supabase
    .from("ai_provider_preferences")
    .upsert(
      {
        owner_id: ownerId,
        openai_mode: "managed",
        preferred_model_id: null,
        version: 1,
      },
      { onConflict: "owner_id", ignoreDuplicates: true },
    )
    .select("*")
    .maybeSingle();

  if (created) return created as PrefsRow;

  const { data: reloaded } = await supabase
    .from("ai_provider_preferences")
    .select("*")
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (!reloaded) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to initialize AI provider preferences",
      500,
      { cause: error?.message },
    );
  }

  return reloaded as PrefsRow;
}

export interface GetAiPreferencesResult {
  preferences: AiProviderPreferences;
  connection: AiProviderConnectionPublic | null;
}

/** Loads preferences + public connection metadata (never secret material). */
export async function getPreferences(
  supabase: AiProviderDbClient,
  ownerId: string,
): Promise<GetAiPreferencesResult> {
  const prefs = await ensurePrefs(supabase, ownerId);

  const { data: connection } = await supabase
    .from("ai_provider_connections")
    .select(
      "id, owner_id, provider, secret_reference, key_fingerprint, last4, status, verified_at, last_error_code, rotated_at",
    )
    .eq("owner_id", ownerId)
    .eq("provider", "openai")
    .maybeSingle();

  return {
    preferences: mapPrefs(prefs),
    connection: connection
      ? mapConnectionPublic(connection as ConnectionRow)
      : null,
  };
}

export interface SetAiModeParams {
  ownerId: string;
  input: z.input<typeof SetAiModeSchema>;
}

/**
 * Updates OpenAI billing mode. BYOK requires a connected key — never silent
 * managed fallback when switching to byok.
 */
export async function setMode(
  supabase: AiProviderDbClient,
  params: SetAiModeParams,
): Promise<AiProviderPreferences> {
  const input = SetAiModeSchema.parse(params.input);
  const prefs = await ensurePrefs(supabase, params.ownerId);

  if (prefs.version !== input.expectedVersion) {
    throw new AppError(
      ErrorCodes.VERSION_CONFLICT,
      "AI provider preferences version conflict",
      409,
      {
        expectedVersion: input.expectedVersion,
        actualVersion: prefs.version,
      },
    );
  }

  if (input.mode === "byok") {
    const { data: connection } = await supabase
      .from("ai_provider_connections")
      .select("status")
      .eq("owner_id", params.ownerId)
      .eq("provider", "openai")
      .maybeSingle();

    // WHY: silent managed fallback would bill the studio for a BYOK user.
    if (!connection || connection.status !== "connected") {
      throw new AppError(
        ErrorCodes.BYOK_KEY_INVALID,
        "Connect and verify an OpenAI key before enabling BYOK mode",
        400,
        { connectionStatus: connection?.status ?? null },
      );
    }
  }

  const nextVersion = prefs.version + 1;
  const { data: updated, error } = await supabase
    .from("ai_provider_preferences")
    .update({
      openai_mode: input.mode,
      version: nextVersion,
    })
    .eq("owner_id", params.ownerId)
    .eq("version", input.expectedVersion)
    .select("*")
    .single();

  if (error || !updated) {
    throw new AppError(
      ErrorCodes.VERSION_CONFLICT,
      "AI provider preferences version conflict",
      409,
    );
  }

  return mapPrefs(updated as PrefsRow);
}

export interface ConnectOpenAiKeyParams {
  ownerId: string;
  input: z.input<typeof ConnectOpenAiKeySchema>;
}

/**
 * Encrypts and stores a BYOK OpenAI key. Status starts as pending until tested.
 */
export async function connectOpenAiKey(
  supabase: AiProviderDbClient,
  params: ConnectOpenAiKeyParams,
): Promise<AiProviderConnectionPublic> {
  const input = ConnectOpenAiKeySchema.parse(params.input);
  const apiKey = input.apiKey.trim();
  const encrypted = encryptSecret(apiKey);
  const fingerprint = fingerprintKey(apiKey);
  const suffix = last4(apiKey);
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("ai_provider_connections")
    .select("id, status")
    .eq("owner_id", params.ownerId)
    .eq("provider", "openai")
    .maybeSingle();

  const payload = {
    owner_id: params.ownerId,
    provider: "openai" as const,
    secret_reference: encrypted,
    key_fingerprint: fingerprint,
    last4: suffix,
    status: "pending" as const,
    verified_at: null,
    last_error_code: null,
    rotated_at: existing ? now : null,
  };

  const { data: row, error } = existing
    ? await supabase
        .from("ai_provider_connections")
        .update(payload)
        .eq("id", existing.id)
        .select(
          "id, owner_id, provider, secret_reference, key_fingerprint, last4, status, verified_at, last_error_code, rotated_at",
        )
        .single()
    : await supabase
        .from("ai_provider_connections")
        .insert(payload)
        .select(
          "id, owner_id, provider, secret_reference, key_fingerprint, last4, status, verified_at, last_error_code, rotated_at",
        )
        .single();

  if (error || !row) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to store OpenAI connection",
      500,
    );
  }

  return mapConnectionPublic(row as ConnectionRow);
}

export interface TestConnectionResult {
  connection: AiProviderConnectionPublic;
  fixture: boolean;
  modelSample?: string;
}

/**
 * Verifies the stored BYOK key (fixture or live models.list). Updates status.
 */
export async function testConnection(
  supabase: AiProviderDbClient,
  ownerId: string,
): Promise<TestConnectionResult> {
  const { data: connection, error } = await supabase
    .from("ai_provider_connections")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("provider", "openai")
    .maybeSingle();

  if (error || !connection) {
    throw new AppError(
      ErrorCodes.BYOK_KEY_INVALID,
      "No OpenAI key is connected",
      400,
    );
  }

  const row = connection as ConnectionRow;
  const fixtureMode = process.env.ACS_AI_FIXTURE_MODE === "true";

  let apiKey: string;
  try {
    apiKey = decryptSecret(row.secret_reference);
  } catch {
    await supabase
      .from("ai_provider_connections")
      .update({
        status: "invalid",
        last_error_code: ErrorCodes.BYOK_KEY_INVALID,
      })
      .eq("id", row.id);
    throw new AppError(
      ErrorCodes.BYOK_KEY_INVALID,
      "Stored OpenAI key could not be decrypted",
      400,
    );
  }

  let modelSample = "fixture-openai";
  let usedFixture = fixtureMode;

  if (!fixtureMode) {
    try {
      const response = await fetch("https://api.openai.com/v1/models", {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!response.ok) {
        const status = response.status;
        const code =
          status === 401 || status === 403
            ? ErrorCodes.BYOK_KEY_INVALID
            : status === 429
              ? ErrorCodes.AI_PROVIDER_RATE_LIMITED
              : ErrorCodes.PROVIDER_UNAVAILABLE;

        await supabase
          .from("ai_provider_connections")
          .update({
            status: "invalid",
            last_error_code: code,
          })
          .eq("id", row.id);

        throw new AppError(code, "OpenAI key verification failed", 400, {
          httpStatus: status,
        });
      }

      const body = (await response.json()) as {
        data?: Array<{ id?: string }>;
      };
      modelSample = body.data?.[0]?.id ?? "unknown";
    } catch (err) {
      if (err instanceof AppError) throw err;
      // Network failures during local verification — do not mark connected.
      throw new AppError(
        ErrorCodes.PROVIDER_UNAVAILABLE,
        "OpenAI verification request failed",
        502,
      );
    }
  }

  // Avoid unused-key lint while keeping decrypt proof in fixture path.
  void apiKey;

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from("ai_provider_connections")
    .update({
      status: "connected",
      verified_at: now,
      last_error_code: null,
    })
    .eq("id", row.id)
    .select(
      "id, owner_id, provider, secret_reference, key_fingerprint, last4, status, verified_at, last_error_code, rotated_at",
    )
    .single();

  if (updateError || !updated) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to update connection after test",
      500,
    );
  }

  return {
    connection: mapConnectionPublic(updated as ConnectionRow),
    fixture: usedFixture,
    modelSample,
  };
}

/** Disconnects BYOK OpenAI — clears ciphertext and marks disconnected. */
export async function disconnect(
  supabase: AiProviderDbClient,
  ownerId: string,
): Promise<{ disconnected: true; preferences: AiProviderPreferences }> {
  const prefs = await ensurePrefs(supabase, ownerId);

  await supabase
    .from("ai_provider_connections")
    .update({
      secret_reference: encryptSecret("revoked"),
      status: "disconnected",
      last_error_code: null,
      verified_at: null,
      key_fingerprint: null,
      last4: null,
    })
    .eq("owner_id", ownerId)
    .eq("provider", "openai");

  // If currently on BYOK, force managed — never leave byok without a key.
  let nextPrefs = mapPrefs(prefs);
  if (prefs.openai_mode === "byok") {
    const nextVersion = prefs.version + 1;
    const { data: updated, error } = await supabase
      .from("ai_provider_preferences")
      .update({
        openai_mode: "managed",
        version: nextVersion,
      })
      .eq("owner_id", ownerId)
      .eq("version", prefs.version)
      .select("*")
      .single();

    if (!error && updated) {
      nextPrefs = mapPrefs(updated as PrefsRow);
    }
  }

  return { disconnected: true, preferences: nextPrefs };
}

export interface AiUsageSummary {
  policy: {
    managedMonthlyAllowance: number;
    managedUsed: number;
    managedRemaining: number;
    currency: string;
    periodStart: string | null;
    periodEnd: string | null;
  };
  recentEvents: Array<{
    id: string;
    mode: OpenAiMode;
    modelId: string | null;
    tokensIn: number | null;
    tokensOut: number | null;
    estimatedCost: number | null;
    requestId: string | null;
    createdAt: string;
  }>;
}

/** Returns managed allowance + recent AI usage events for settings UI. */
export async function getAiUsage(
  supabase: AiProviderDbClient,
  ownerId: string,
): Promise<AiUsageSummary> {
  await supabase.from("ai_usage_policy").upsert(
    {
      owner_id: ownerId,
      managed_monthly_allowance: 0,
      managed_used: 0,
      currency: "USD",
    },
    { onConflict: "owner_id", ignoreDuplicates: true },
  );

  const { data: policyRow } = await supabase
    .from("ai_usage_policy")
    .select("*")
    .eq("owner_id", ownerId)
    .maybeSingle();

  const policy = (policyRow ?? {
    owner_id: ownerId,
    managed_monthly_allowance: 0,
    managed_used: 0,
    currency: "USD",
    period_start: null,
    period_end: null,
  }) as UsagePolicyRow;

  const allowance = Number(policy.managed_monthly_allowance) || 0;
  const used = Number(policy.managed_used) || 0;

  const { data: events } = await supabase
    .from("ai_usage_events")
    .select(
      "id, mode, model_id, tokens_in, tokens_out, estimated_cost, request_id, created_at",
    )
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(25);

  return {
    policy: {
      managedMonthlyAllowance: allowance,
      managedUsed: used,
      managedRemaining: Math.max(0, allowance - used),
      currency: policy.currency,
      periodStart: policy.period_start,
      periodEnd: policy.period_end,
    },
    recentEvents: ((events ?? []) as UsageEventRow[]).map((event) => ({
      id: event.id,
      mode: event.mode,
      modelId: event.model_id,
      tokensIn: event.tokens_in,
      tokensOut: event.tokens_out,
      estimatedCost:
        event.estimated_cost === null || event.estimated_cost === undefined
          ? null
          : Number(event.estimated_cost),
      requestId: event.request_id,
      createdAt: event.created_at,
    })),
  };
}
