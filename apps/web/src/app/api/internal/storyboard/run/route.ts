import { z } from "zod";
import { handle } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { generateStoryboard } from "@/lib/server/storyboard";

export const maxDuration = 300;

/** Draws one content's storyboard images (queued on approve / on demand). */
export async function POST(req: Request) {
  return handle(async () => {
    assertInternalServiceAuth(req);
    const { contentId, force } = z.object({ contentId: z.string().uuid(), force: z.boolean().optional() }).parse(await req.json());
    return generateStoryboard(contentId, { force });
  });
}
