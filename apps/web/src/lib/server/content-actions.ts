import "server-only";
import { after } from "next/server";
import type { ContentAction } from "@acs/domain";
import { approveContent, holdContent, rejectContent, requestRender, restoreContent, skipContent, unlockContent } from "./projects";
import { publishNow, runPublishJob } from "./publishing";
import { redrawStoryboard } from "./storyboard";

/**
 * Every action on one content (POST /api/contents/:id/actions).
 * remove = before media (gone, remembered for duplicates) or reject after media;
 * hold / resume = keep the video but don't publish until resumed.
 */
export async function contentAction(ownerId: string, contentId: string, action: ContentAction) {
  switch (action) {
    case "approve":
      return approveContent(ownerId, contentId);
    case "remove":
      return rejectContent(ownerId, contentId);
    case "skip":
      return skipContent(ownerId, contentId);
    case "restore":
      return restoreContent(ownerId, contentId);
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
