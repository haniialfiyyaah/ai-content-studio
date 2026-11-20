import { ZodError } from "zod";
import { AppError, ErrorCodes } from "./errors";

export interface Envelope<T> {
  status: "ok" | "error";
  data: T | null;
  error: { code: string; message: string; details?: unknown } | null;
}

export const ok = <T>(data: T): Envelope<T> => ({ status: "ok", data, error: null });

export function toErrorEnvelope(error: unknown): { body: Envelope<null>; status: number } {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        status: "error",
        data: null,
        error: { code: error.code, message: error.message, details: error.details },
      },
    };
  }
  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        status: "error",
        data: null,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: error.issues[0]?.message ?? "Invalid request",
          details: error.flatten(),
        },
      },
    };
  }
  console.error("[acs] unhandled error", error);
  return {
    status: 500,
    body: {
      status: "error",
      data: null,
      error: { code: ErrorCodes.INTERNAL_ERROR, message: "Something went wrong" },
    },
  };
}
