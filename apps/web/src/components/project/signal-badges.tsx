import { Bell, CalendarClock, Hand, Loader2, Zap } from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import type { ProjectSignals } from "@/lib/server/signals";

/** Status signals next to a project's status pill: needs you · in progress · next upload · auto/manual. */
export function SignalBadges({ s, status, timezone, compact }: { s?: ProjectSignals; status: string; timezone?: string; compact?: boolean }) {
  if (!s) return null;
  return (
    <div className="signals">
      {s.needsYou > 0 && (
        <span className="signal needs" title="Waiting for your confirm">
          <Bell size={11} /> Needs you{status === "setup" ? "" : ` (${s.needsYou})`}
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
      {status !== "setup" && (
        <span className={`signal ${s.auto ? "auto" : "manual"}`} title={s.auto ? "Steps continue without your confirm" : "Every step waits for your confirm"}>
          {s.auto ? <Zap size={11} /> : <Hand size={11} />} {s.auto ? "Auto-approve" : "Manual"}
        </span>
      )}
    </div>
  );
}
