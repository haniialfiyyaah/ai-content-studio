import { AppError, ErrorCodes } from "@acs/domain";

/**
 * Authenticates n8n / worker calls to /api/internal/*.
 * Accepts ACS_INTERNAL_SERVICE_TOKEN plus optional comma-separated
 * ACS_INTERNAL_SERVICE_TOKEN_ALIASES. In non-production, also accepts the
 * historical compose default `local-internal-token` so a running n8n container
 * keeps working until `docker-compose up -d --force-recreate n8n`.
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

  const aliases = (process.env.ACS_INTERNAL_SERVICE_TOKEN_ALIASES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (process.env.NODE_ENV !== "production") {
    aliases.push("local-internal-token");
  }

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
