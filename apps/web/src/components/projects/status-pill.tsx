import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-accent-soft text-accent",
  active: "bg-success/15 text-success",
  paused: "bg-warning/15 text-warning",
  stopped: "bg-danger/10 text-danger",
  archived: "bg-black/5 text-muted",
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
