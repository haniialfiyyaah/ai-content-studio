/**
 * What a project is doing, in the creator's words — derived from its status,
 * its content step and its videos (no extra database state).
 */
export const PHASES = ["setting_up", "planning", "producing", "ready", "live", "paused", "stopped", "archived"] as const;
export type Phase = (typeof PHASES)[number];

export const PHASE_LABELS: Record<Phase, string> = {
  setting_up: "Setting up",
  planning: "Planning",
  producing: "Producing",
  ready: "Ready to publish",
  live: "Live",
  paused: "Paused",
  stopped: "Stopped",
  archived: "Archived",
};

/** pill colour class per phase */
export const PHASE_PILL: Record<Phase, string> = {
  setting_up: "pill draft",
  planning: "pill draft",
  producing: "pill blue",
  ready: "pill approved",
  live: "pill active",
  paused: "pill paused",
  stopped: "pill stopped",
  archived: "pill stopped",
};

export function projectPhase(
  p: { status: string; content_stage?: string | null },
  videos: { approved: number; ready: number; rendering: number },
): Phase {
  if (p.status === "archived") return "archived";
  if (p.status === "setup") return "setting_up";
  if (p.status === "live") return "live";
  if (p.status === "paused") return "paused";
  if (p.status === "stopped") return "stopped";
  // draft: content setup → planning; videos → producing until every approved video is ready
  if (p.content_stage !== "production") return "planning";
  if (videos.rendering > 0 || videos.ready < videos.approved || !videos.approved) return "producing";
  return "ready";
}

/** One content, in the creator's words. */
export function contentPhaseLabel(c: { status: string; on_hold?: boolean | null }, render?: { status: string } | null, job?: { status: string } | null) {
  if (c.status === "skipped") return "Skipped";
  if (c.on_hold) return "On hold";
  if (job?.status === "published") return "Published";
  if (job && ["scheduled", "publishing"].includes(job.status)) return "Scheduled";
  if (render?.status === "ready") return "Video ready";
  if (c.status === "approved") return "Approved";
  return "Idea";
}
