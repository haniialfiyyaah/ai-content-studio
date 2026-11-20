import { handle } from "@/lib/api/response";
import { disconnectYoutube } from "@/lib/server/publishing";
import { requireUser } from "@/lib/server/session";

export async function DELETE() {
  return handle(async () => {
    const { user } = await requireUser();
    return disconnectYoutube(user.id);
  });
}
