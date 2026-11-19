import type { ActionEnvelope } from "@acs/schemas";
import { ZodError } from "zod";
import { AppError, ErrorCodes } from "./errors";

function newId(): string {
  return crypto.randomUUID();
}

export function okEnvelope<T>(
  data: T,
  correlationId = newId(),
): ActionEnvelope<T> {
  return {
    requestId: newId(),
    status: "ok",
    data,
    error: null,
    correlationId,
  };
}

export function acceptedEnvelope<T>(
  data: T,
  correlationId = newId(),
): ActionEnvelope<T> {
  return {
    requestId: newId(),
    status: "accepted",
    data,
    error: null,
    correlationId,
  };
}

export function errorEnvelope(
  error: unknown,
  correlationId = newId(),
): ActionEnvelope<null> {
  if (error instanceof AppError) {
    return {
      requestId: newId(),
      status: "error",
      data: null,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
      correlationId,
    };
  }

  if (error instanceof ZodError) {
    return {
      requestId: newId(),
      status: "error",
      data: null,
      error: {
        code: ErrorCodes.VALIDATION_ERROR,
        message: "Invalid request",
        details: error.flatten(),
      },
      correlationId,
    };
  }

  console.error("[domain] unhandled error", error);
  return {
    requestId: newId(),
    status: "error",
    data: null,
    error: {
      code: ErrorCodes.INTERNAL_ERROR,
      message: "An unexpected error occurred",
    },
    correlationId,
  };
}

export function httpStatusForError(error: unknown): number {
  if (error instanceof AppError) {
    return error.status;
  }
  if (error instanceof ZodError) {
    return 400;
  }
  return 500;
}
