import { AppError, ErrorCodes } from "@acs/domain";
import { createClient } from "@/lib/supabase/server";
import { jsonError, jsonOk } from "@/lib/api/response";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      throw new AppError(ErrorCodes.UNAUTHENTICATED, "Not signed in", 401);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, avatar_url, timezone")
      .eq("id", user.id)
      .maybeSingle();

    return jsonOk({
      id: user.id,
      email: user.email,
      displayName: profile?.display_name ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      timezone: profile?.timezone ?? "UTC",
    });
  } catch (error) {
    return jsonError(error);
  }
}
