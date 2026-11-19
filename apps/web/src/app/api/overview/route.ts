import { AppError, ErrorCodes } from "@acs/domain";
import { createClient } from "@/lib/supabase/server";
import { jsonError, jsonOk } from "@/lib/api/response";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHENTICATED, "Not signed in", 401);
    }

    const { data: projects, error } = await supabase
      .from("projects")
      .select("id, status, name, updated_at")
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, error.message, 500);
    }

    const list = projects ?? [];
    const counts = {
      draft: list.filter((p) => p.status === "draft").length,
      active: list.filter((p) => p.status === "active").length,
      paused: list.filter((p) => p.status === "paused").length,
      stopped: list.filter((p) => p.status === "stopped").length,
      total: list.length,
    };

    return jsonOk({
      isReturning: list.length > 0,
      counts,
      recentProjects: list.slice(0, 5),
      reviewNeeds: {
        conceptsPending: 0,
        videosPending: 0,
      },
      warnings: [],
    });
  } catch (error) {
    return jsonError(error);
  }
}
