import { cn } from "@/lib/utils";

type PillTone = "done" | "current" | "working" | "blocked" | "quiet";

/**
 * Status tone follows the consent track: teal when a decision is settled,
 * sand when the creator owes one, sage while work is running, clay on trouble.
 */
const STATUS_TONES: Record<string, PillTone> = {
  draft: "quiet",
  pending_review: "current",
  ready_for_review: "current",
  approved: "done",
  active: "done",
  enabled: "done",
  published: "done",
  generated: "done",
  paused: "blocked",
  stopped: "blocked",
  failed: "blocked",
  blocked: "blocked",
  held: "blocked",
  queued: "working",
  preparing: "working",
  generating: "working",
  rendering: "working",
  validating: "working",
  scheduled: "working",
  publishing: "working",
  running: "working",
  draft_intent: "quiet",
  archived: "quiet",
  disabled: "quiet",
  upload: "quiet",
  imported: "quiet",
  derived: "quiet",
};

export function StatusPill({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const tone = STATUS_TONES[status] ?? "quiet";
  return (
    <span
      className={cn("pill", tone !== "quiet" && `pill--${tone}`, className)}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}
