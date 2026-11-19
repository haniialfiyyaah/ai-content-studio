import { AppError, ErrorCodes } from "@acs/domain";

/**
 * Authenticates n8n / worker calls to /api/internal/*.
 * Compares x-acs-service-token to ACS_INTERNAL_SERVICE_TOKEN (constant-time-ish).
 */
export function assertInternalServiceAuth(request: Request): void {
  const expected = process.env.ACS_INTERNAL_SERVICE_TOKEN;
  if (!expected) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "ACS_INTERNAL_SERVICE_TOKEN is not configured",
      500,
    );
  }

  const provided = request.headers.get("x-acs-service-token");
  if (!provided || provided !== expected) {
    // WHY: do not echo the provided token — avoids secret leakage in logs/envelopes.
    throw new AppError(
      ErrorCodes.UNAUTHENTICATED,
      "Invalid internal service token",
      401,
    );
  }
}
