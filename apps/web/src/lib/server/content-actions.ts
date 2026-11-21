import "server-only";
import { after } from "next/server";
import { notFound, type ContentAction } from "@acs/domain";
import { approveContent, holdContent, rejectContent, requestRender, unlockContent } from "./projects";
import { publishNow, runPublishJob } from "./publishing";
import { markFrame, queueSceneRedraw, redrawStoryboard } from "./storyboard";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Every action on one content (POST /api/contents/:id/actions).
 * remove = before media (gone, remembered for duplicates) or reject after media;
 * hold / resume = keep the video but don't publish until resumed.
 */
export async function contentAction(ownerId: string, contentId: string, action: ContentAction, opts: { scene?: number } = {}) {
  switch (action) {
    case "redraw_scene": {
      // Same scene text, a new image (locked to the storyboard, matched to its neighbours).
      const { data } = await createAdminClient().from("contents").select("id, scenes").eq("id", contentId).eq("owner_id", ownerId).maybeSingle();
      const scene = opts.scene ?? -1;
      if (!data || scene < 0 || scene >= ((data.scenes as unknown[]) ?? []).length) throw notFound("Scene");
      await markFrame(contentId, scene, "drawing");
      queueSceneRedraw(contentId, scene);
      return { redrawing: scene };
    }
    case "approve":
      return approveContent(ownerId, contentId);
    case "remove":
      return rejectContent(ownerId, contentId);
    case "hold":
      return holdContent(ownerId, contentId, true);
    case "resume":
      return holdContent(ownerId, contentId, false);
    case "unlock":
      return unlockContent(ownerId, contentId);
    case "storyboard":
      return redrawStoryboard(ownerId, contentId);
    case "render":
      return requestRender(ownerId, contentId);
    case "publish": {
      const { jobId } = await publishNow(ownerId, contentId);
      after(() => runPublishJob(jobId).then(() => undefined));
      return { publishing: true };
    }
  }
}
