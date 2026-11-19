import {
  AppError,
  ErrorCodes,
  type AiProviderConnectionStatus,
  type OpenAiMode,
} from "@acs/schemas";

/** Preference row fields needed to resolve the active OpenAI billing path. */
export interface OpenAiModePrefs {
  openaiMode: OpenAiMode;
}

/** Connection row fields — status gates BYOK; never used to silently switch mode. */
export interface OpenAiModeConnection {
  status?: AiProviderConnectionStatus | null;
}

/**
 * Resolves the OpenAI mode from stored preferences.
 * Connection status is accepted for call-site convenience but MUST NOT override
 * prefs — BYOK → managed fallback is an explicit product invariant violation.
 */
export function resolveOpenAiMode(
  prefs: OpenAiModePrefs,
  _connection?: OpenAiModeConnection | null,
): OpenAiMode {
  return prefs.openaiMode;
}

export interface AiPolicyCheckInput {
  mode: OpenAiMode;
  connectionStatus: AiProviderConnectionStatus | null | undefined;
  /** Remaining managed allowance in currency units (allowance − used). */
  managedRemaining: number;
}

export interface AiPolicyCheckResult {
  mode: OpenAiMode;
  allowed: true;
}

/**
 * Enforces AI spend/key policy before any provider call.
 * BYOK with a non-connected key fails hard — never falls back to managed.
 */
export function assertAiPolicy(
  input: AiPolicyCheckInput,
): AiPolicyCheckResult {
  if (input.mode === "byok") {
    // WHY: silent managed fallback would bill the studio for a BYOK user.
    if (input.connectionStatus !== "connected") {
      throw new AppError(
        ErrorCodes.BYOK_KEY_INVALID,
        "Bring-your-own OpenAI key is missing or not connected",
        400,
        { connectionStatus: input.connectionStatus ?? null },
      );
    }
    return { mode: "byok", allowed: true };
  }

  if (input.managedRemaining <= 0) {
    throw new AppError(
      ErrorCodes.MANAGED_ALLOWANCE_EXHAUSTED,
      "Managed OpenAI allowance is exhausted for this period",
      402,
      { managedRemaining: input.managedRemaining },
    );
  }

  return { mode: "managed", allowed: true };
}
