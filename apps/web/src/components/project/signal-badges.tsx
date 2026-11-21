import { Bell, CalendarClock, Loader2, Zap } from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import type { ProjectSignals } from "@/lib/server/signals";

/** Status signals next to a project's status pill: needs you · in progress · next upload · auto/manual. */
export function SignalBadges({ s, status, timezone, compact }: { s?: ProjectSignals; status: string; timezone?: string; compact?: boolean }) {
  if (!s) return null;
  return (
    <div className="signals">
      {s.needsYou > 0 && (
        <span className="signal needs" title="Waiting for your confirm">
          <Bell size={11} /> Needs you{s.needsYou > 1 ? ` (${s.needsYou})` : ""}
        </span>
      )}
      {s.inProgress && (
        <span className="signal busy" title="Generating or rendering now">
          <Loader2 size={11} className="spin" /> In progress
        </span>
      )}
      {s.nextUpload && (
        <span className="signal next" title="Next scheduled upload">
          <CalendarClock size={11} /> {compact ? "Next" : "Next upload"} {fmtDateTime(s.nextUpload, timezone)}
        </span>
      )}
      {s.auto && (
        <span className="signal auto" title="Steps continue without waiting for your confirm">
          <Zap size={11} /> Auto
        </span>
      )}
    </div>
  );
}
