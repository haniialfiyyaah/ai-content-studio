import { z } from "zod";
import { handle } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { generateStoryboard, redrawScene } from "@/lib/server/storyboard";

export const maxDuration = 300;

/** Draws one content's storyboard images, or redraws one scene (`scene`). */
export async function POST(req: Request) {
  return handle(async () => {
    assertInternalServiceAuth(req);
    const { contentId, force, scene } = z
      .object({ contentId: z.string().uuid(), force: z.boolean().optional(), scene: z.number().int().min(0).max(20).optional() })
      .parse(await req.json());
    return scene !== undefined ? redrawScene(contentId, scene) : generateStoryboard(contentId, { force });
  });
}
