import { decryptSecret } from "@acs/integrations";
import {
  AppError,
  ErrorCodes,
  type AiProviderConnectionStatus,
  type OpenAiMode,
} from "@acs/schemas";
import { assertAiPolicy } from "../ai-gateway";

/** Minimal Supabase surface for AI execution prep. */
export interface AiExecutionDbClient {
  from: (table: string) => any;
}

export interface PreparedOpenAiExecution {
  mode: OpenAiMode;
  managedApiKey: string | null;
  /** Decrypted BYOK key — never log or return to clients/n8n. */
  byokApiKey: string | null;
  fixtureMode: boolean;
  connectionStatus: AiProviderConnectionStatus | null;
  managedRemaining: number;
}

/**
 * Resolves managed vs BYOK credentials for a trusted server-side OpenAI call.
 * WHY: decrypt happens only here so n8n never receives plaintext keys.
 */
export async function prepareOpenAiExecution(
  supabase: AiExecutionDbClient,
  ownerId: string,
): Promise<PreparedOpenAiExecution> {
  const { data: prefs } = await supabase
    .from("ai_provider_preferences")
    .select("openai_mode")
    .eq("owner_id", ownerId)
    .maybeSingle();

  const mode: OpenAiMode = prefs?.openai_mode === "byok" ? "byok" : "managed";

  const { data: connection } = await supabase
    .from("ai_provider_connections")
    .select("status, secret_reference")
    .eq("owner_id", ownerId)
    .eq("provider", "openai")
    .maybeSingle();

  const connectionStatus =
    (connection?.status as AiProviderConnectionStatus | undefined) ?? null;

  const { data: policy } = await supabase
    .from("ai_usage_policy")
    .select("managed_monthly_allowance, managed_used")
    .eq("owner_id", ownerId)
    .maybeSingle();

  const allowance = Number(
    policy?.managed_monthly_allowance ??
      process.env.ACS_MANAGED_MONTHLY_ALLOWANCE ??
      500,
  );
  const used = Number(policy?.managed_used ?? 0);
  const managedRemaining = Math.max(0, allowance - used);

  // Fixture when explicitly enabled, or managed path with no studio key.
  // BYOK never uses managed key — fixture for BYOK only when ACS_AI_FIXTURE_MODE=true.
  const fixtureMode =
    process.env.ACS_AI_FIXTURE_MODE === "true" ||
    (mode === "managed" && !process.env.OPENAI_API_KEY);

  assertAiPolicy({
    mode,
    connectionStatus,
    managedRemaining,
    fixtureMode,
  });

  let byokApiKey: string | null = null;
  if (mode === "byok") {
    if (!connection?.secret_reference) {
      throw new AppError(
        ErrorCodes.BYOK_KEY_INVALID,
        "Bring-your-own OpenAI key is missing or not connected",
        400,
      );
    }
    try {
      byokApiKey = decryptSecret(connection.secret_reference);
    } catch {
      throw new AppError(
        ErrorCodes.BYOK_KEY_INVALID,
        "Stored OpenAI key could not be decrypted",
        400,
      );
    }
  }

  return {
    mode,
    managedApiKey: process.env.OPENAI_API_KEY ?? null,
    byokApiKey,
    fixtureMode,
    connectionStatus,
    managedRemaining,
  };
}
