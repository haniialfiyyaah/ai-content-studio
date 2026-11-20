import { NextResponse } from "next/server";
import { ok, toErrorEnvelope } from "@acs/domain";

export const jsonOk = <T>(data: T, status = 200) => NextResponse.json(ok(data), { status });

export function jsonError(error: unknown) {
  const { body, status } = toErrorEnvelope(error);
  return NextResponse.json(body, { status });
}

/** Wraps a route handler body so every thrown error becomes an envelope. */
export async function handle<T>(fn: () => Promise<T>, status = 200) {
  try {
    return jsonOk(await fn(), status);
  } catch (error) {
    return jsonError(error);
  }
}
