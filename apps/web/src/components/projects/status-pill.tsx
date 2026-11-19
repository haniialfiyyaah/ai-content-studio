import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-accent-soft text-accent",
  ready_for_review: "bg-[#fff4e6] text-[#a36f39]",
  pending_review: "bg-warning/15 text-warning",
  approved: "bg-success/15 text-success",
  active: "bg-success/15 text-success",
  paused: "bg-warning/15 text-warning",
  stopped: "bg-danger/10 text-danger",
  archived: "bg-black/5 text-muted",
  enabled: "bg-success/15 text-success",
  disabled: "bg-black/5 text-muted",
  draft_intent: "bg-accent-soft text-accent",
  scheduled: "bg-info/15 text-info",
  publishing: "bg-info/15 text-info",
  published: "bg-success/15 text-success",
  failed: "bg-danger/10 text-danger",
  blocked: "bg-warning/15 text-warning",
  upload: "bg-accent-soft text-accent",
  generated: "bg-success/15 text-success",
  imported: "bg-info/15 text-info",
  derived: "bg-black/5 text-muted",
};

export function StatusPill({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-medium capitalize",
        STATUS_STYLES[status] ?? "bg-accent-soft text-accent",
        className,
      )}
    >
      {status}
    </span>
  );
}
