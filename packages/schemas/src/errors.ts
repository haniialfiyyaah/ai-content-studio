/** Machine-readable error codes used across API and workflows. */
export const ErrorCodes = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  VERSION_CONFLICT: "VERSION_CONFLICT",
  INITIAL_LAUNCH_NOT_READY: "INITIAL_LAUNCH_NOT_READY",
  BUDGET_AUTHORIZATION_REQUIRED: "BUDGET_AUTHORIZATION_REQUIRED",
  BYOK_KEY_INVALID: "BYOK_KEY_INVALID",
  BYOK_QUOTA_EXCEEDED: "BYOK_QUOTA_EXCEEDED",
  BYOK_MODEL_UNAVAILABLE: "BYOK_MODEL_UNAVAILABLE",
  MANAGED_ALLOWANCE_EXHAUSTED: "MANAGED_ALLOWANCE_EXHAUSTED",
  AI_PROVIDER_RATE_LIMITED: "AI_PROVIDER_RATE_LIMITED",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  PROVIDER_UNKNOWN: "PROVIDER_UNKNOWN",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  PROJECT_NOT_ACTIONABLE: "PROJECT_NOT_ACTIONABLE",
  CONCEPT_NOT_APPROVED: "CONCEPT_NOT_APPROVED",
  VIDEO_NOT_APPROVED: "VIDEO_NOT_APPROVED",
  DESTINATION_UNAUTHORIZED: "DESTINATION_UNAUTHORIZED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    status = 400,
    details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
