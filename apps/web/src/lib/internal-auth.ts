import { AppError, ErrorCodes } from "@acs/domain";

/**
 * Authenticates n8n / worker calls to /api/internal/*.
 *
 * Allowed tokens:
 * - ACS_INTERNAL_SERVICE_TOKEN (required)
 * - ACS_INTERNAL_SERVICE_TOKEN_ALIASES (optional comma-separated)
 *
 * Legacy hardcoded `local-internal-token` is NO longer accepted.
 * Align docker-compose with .env via:
 *   docker-compose up -d --force-recreate n8n
 *
 * Production: set ACS_REJECT_INTERNAL_TOKEN_ALIASES=true (or NODE_ENV=production)
 * to refuse aliases entirely — only the primary token works.
 */
export function assertInternalServiceAuth(request: Request): void {
  const primary = process.env.ACS_INTERNAL_SERVICE_TOKEN;
  if (!primary) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "ACS_INTERNAL_SERVICE_TOKEN is not configured",
      500,
    );
  }

  const rejectAliases =
    process.env.NODE_ENV === "production" ||
    process.env.ACS_REJECT_INTERNAL_TOKEN_ALIASES === "true";

  const aliases = rejectAliases
    ? []
    : (process.env.ACS_INTERNAL_SERVICE_TOKEN_ALIASES ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

  const allowed = new Set([primary, ...aliases]);
  const provided = request.headers.get("x-acs-service-token");

  if (!provided || !allowed.has(provided)) {
    // WHY: do not echo the provided token — avoids secret leakage in logs/envelopes.
    throw new AppError(
      ErrorCodes.UNAUTHENTICATED,
      "Invalid internal service token",
      401,
    );
  }
}
