/**
 * Where a content sits on the project pipeline (docs/FLOW.md):
 *   ideas → storyboard → images → video → publish
 * Pure — used by the board (server) and the panel.
 */
export const STAGES = ["ideas", "storyboard", "images", "video", "publish"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  ideas: "Ideas",
  storyboard: "Storyboard",
  images: "Images",
  video: "Video",
  publish: "Publish",
};

export const STAGE_HELP: Record<Stage, string> = {
  ideas: "Pick options, approve or remove",
  storyboard: "Scenes & script, before images",
  images: "Scene images being drawn",
  video: "Rendering and ready videos",
  publish: "Scheduled and published",
};

interface C {
  status: string;
  on_hold?: boolean;
  storyboard_status?: string | null;
}
interface R {
  status: string;
}
interface J {
  status: string;
}

export function contentStage(c: C, render?: R | null, job?: J | null): Stage {
  if (c.status === "idea") return "ideas";
  if (job && job.status !== "cancelled") return "publish";
  if (render && ["queued", "rendering", "ready"].includes(render.status)) return "video";
  if (c.storyboard_status === "generating" || c.storyboard_status === "ready") return "images";
  return "storyboard";
}

/** One short line under the card title + whether it waits for the creator. */
export function stageStatus(stage: Stage, c: C, render?: (R & { phase?: string | null }) | null, job?: (J & { scheduled_for?: string | null }) | null) {
  if (c.on_hold) return { text: "⏸ On hold — won't publish", needsYou: false, busy: false };
  switch (stage) {
    case "ideas":
      return { text: "Review & approve", needsYou: true, busy: false };
    case "storyboard":
      return c.storyboard_status === "failed"
        ? { text: "Images failed — redraw", needsYou: true, busy: false }
        : { text: "Waiting for images", needsYou: false, busy: false };
    case "images":
      return c.storyboard_status === "generating"
        ? { text: "Drawing scenes…", needsYou: false, busy: true }
        : { text: "Images ready — render next", needsYou: false, busy: false };
    case "video":
      if (render?.status === "ready") return { text: "▶ Video ready", needsYou: false, busy: false };
      return { text: render?.phase === "compose" ? "Composing…" : render?.status === "queued" ? "Queued…" : "Rendering…", needsYou: false, busy: true };
    case "publish":
      if (job?.status === "published") return { text: "✓ Published", needsYou: false, busy: false };
      if (job?.status === "publishing") return { text: "Uploading…", needsYou: false, busy: true };
      if (job?.status === "failed") return { text: "Upload failed — retry", needsYou: true, busy: false };
      return { text: "Scheduled", needsYou: false, busy: false };
  }
}
