import { z } from "zod";
import { handle } from "@/lib/api/response";
import { requireUser } from "@/lib/server/session";

const Body = z.object({
  displayName: z.string().trim().min(1).max(80),
  timezone: z.string().min(1).max(64),
});

export async function PATCH(req: Request) {
  return handle(async () => {
    const { user, supabase } = await requireUser();
    const body = Body.parse(await req.json());
    await supabase.from("profiles").update({ display_name: body.displayName, timezone: body.timezone }).eq("id", user.id);
    return body;
  });
}
