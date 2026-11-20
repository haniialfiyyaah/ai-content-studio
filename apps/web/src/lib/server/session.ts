import "server-only";
import { cache } from "react";
import { AppError, ErrorCodes } from "@acs/domain";
import { createClient } from "@/lib/supabase/server";

/**
 * Authenticated user + RLS-scoped client, or throws 401. Uses getClaims()
 * (JWT verified locally against the project's JWKS) instead of a network call.
 * Memoised per request so layout + page + helpers verify once.
 */
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) throw new AppError(ErrorCodes.UNAUTHENTICATED, "Not signed in", 401);
  return { supabase, user: { id: claims.sub, email: (claims.email as string | undefined) ?? null } };
});

export function appUrl(): string {
  return (process.env.ACS_API_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}
