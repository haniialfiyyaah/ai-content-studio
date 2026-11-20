export const ErrorCodes = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  NOT_READY: "NOT_READY",
  PROVIDER_ERROR: "PROVIDER_ERROR",
  NOT_CONFIGURED: "NOT_CONFIGURED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what: string) =>
  new AppError(ErrorCodes.NOT_FOUND, `${what} not found`, 404);

export const conflict = (message: string, details?: unknown) =>
  new AppError(ErrorCodes.CONFLICT, message, 409, details);
