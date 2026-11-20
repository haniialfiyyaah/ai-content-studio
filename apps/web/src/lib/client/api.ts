"use client";

/** Calls a Studio API route and unwraps the envelope; throws Error(message). */
export async function api<T = unknown>(path: string, method = "POST", body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!res.ok || !json || json.error) throw new Error(json?.error?.message ?? `Request failed (${res.status})`);
  return json.data as T;
}
