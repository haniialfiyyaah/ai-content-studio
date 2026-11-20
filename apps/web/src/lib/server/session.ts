import "server-only";
import { AppError, ErrorCodes } from "@acs/domain";
import { createClient } from "@/lib/supabase/server";

/** Authenticated user + RLS-scoped client, or throws 401. */
export async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new AppError(ErrorCodes.UNAUTHENTICATED, "Not signed in", 401);
  return { supabase, user: data.user };
}

export function appUrl(): string {
  return (process.env.ACS_API_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}
