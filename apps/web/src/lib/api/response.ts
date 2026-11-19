import { NextResponse } from "next/server";
import {
  acceptedEnvelope,
  errorEnvelope,
  httpStatusForError,
  okEnvelope,
} from "@acs/domain";

export function jsonOk<T>(data: T, correlationId?: string) {
  return NextResponse.json(okEnvelope(data, correlationId));
}

export function jsonAccepted<T>(data: T, correlationId?: string) {
  return NextResponse.json(acceptedEnvelope(data, correlationId), {
    status: 202,
  });
}

export function jsonError(error: unknown, correlationId?: string) {
  const body = errorEnvelope(error, correlationId);
  return NextResponse.json(body, { status: httpStatusForError(error) });
}
