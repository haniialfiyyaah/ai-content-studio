"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Check, Rocket } from "lucide-react";
import { ScheduleSchema, computeSlots, describeSchedule, type Schedule } from "@acs/domain";
import { api } from "@/lib/client/api";
import { Spinner } from "@/components/ui/spinner";

export interface LaunchItem {
  id: string;
  n: number;
  title: string;
  status: string;
  scenes: number;
}

/**
 * The one "Approve & schedule" step. Every idea is ticked by default; untick
 * the ones you don't want — they're removed (no images, render or upload).
 * The rest are approved, slotted and go live.
 */
export function LaunchPanel({
  projectId,
  projectStatus,
  items,
  schedule,
  youtubeConnected,
}: {
  projectId: string;
  projectStatus: string;
  items: LaunchItem[];
  schedule: Partial<Schedule> | null;
  youtubeConnected: boolean;
}) {
  const router = useRouter();
  const [off, setOff] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const parsed = ScheduleSchema.safeParse(schedule);
  const kept = items.filter((i) => !off.has(i.id));
  const slots = useMemo(() => (parsed.success ? computeSlots(parsed.data, kept.length) : []), [parsed.success, schedule, kept.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: parsed.success ? parsed.data.timezone : undefined }).format(d);

  const toggle = (id: string) =>
    setOff((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const goesLive = projectStatus === "draft" && youtubeConnected;
  const label = !kept.length
    ? "Keep at least one idea"
    : goesLive
      ? `Approve ${kept.length} & go live`
      : projectStatus === "active"
        ? `Approve ${kept.length} & add to schedule`
        : `Approve ${kept.length} & schedule`;

  function launch() {
    setError(null);
    setNotice(null);
    start(async () => {
      try {
        const r = await api<{ needsYoutube: boolean; status: string; excluded: number }>(`/api/projects/${projectId}/launch`, "POST", {
          include: kept.map((i) => i.id),
          exclude: [...off],
        });
        setOff(new Set());
        setNotice(
          r.needsYoutube
            ? "Approved and scheduled. Connect YouTube to go live — uploads start at the first slot."
            : r.status === "active"
              ? "You're live — videos render now and upload at each slot."
              : "Approved and scheduled.",
        );
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="card pad" id="launch">
      <div className="section">
        <div>
          <h2>Approve &amp; schedule</h2>
          <p>Untick any idea you don&apos;t want — it&apos;s removed and never drawn, rendered or published.</p>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="small muted">Nothing waiting — every idea is scheduled or published.</p>
      ) : (
        <div className="checks">
          {items.map((i) => {
            const on = !off.has(i.id);
            const slot = on ? slots[kept.indexOf(i)] : undefined;
            return (
              <label key={i.id} className={`listrow rowclick launchrow ${on ? "" : "is-off"}`}>
                <div className="row">
                  <input type="checkbox" checked={on} onChange={() => toggle(i.id)} disabled={pending} aria-label={`Keep #${i.n}`} />
                  <div>
                    <div className="small semibold">#{i.n} · {i.title}</div>
                    <div className="xs muted">
                      {on ? (slot ? `${fmt(slot)} · ${i.scenes} scenes` : `${i.scenes} scenes`) : "Will be removed"}
                    </div>
                  </div>
                </div>
                <span className={`pill ${i.status === "approved" ? "approved" : ""}`}>{i.status === "approved" ? "Approved" : "Pending"}</span>
              </label>
            );
          })}
        </div>
      )}

      <div className="divider" />
      <div className="stack" style={{ gap: 6 }}>
        <div className="row between xs">
          <span className="muted">Schedule: <strong>{describeSchedule(schedule)}</strong></span>
          <Link className="linklike" href={`/projects/${projectId}?tab=schedule`}>{parsed.success ? "Change" : "Set days & time"} →</Link>
        </div>
        {projectStatus === "draft" && (
          <div className="row between xs">
            <span className="muted">YouTube: <strong>{youtubeConnected ? "Connected" : "Not connected"}</strong></span>
            {!youtubeConnected && <Link className="linklike" href="/settings?section=connections">Connect →</Link>}
          </div>
        )}
      </div>
      <div className="row between" style={{ marginTop: 14 }}>
        <span className="xs muted">
          {off.size ? `${off.size} to remove · ` : ""}
          {goesLive ? "Videos render now and upload at each slot." : !youtubeConnected && projectStatus === "draft" ? "Goes live once YouTube is connected." : ""}
        </span>
        {items.length > 0 && (
          <button className="btn primary" disabled={pending || !kept.length || !parsed.success} onClick={launch}>
            {pending ? <Spinner size={13} /> : goesLive ? <Rocket size={14} /> : <Check size={14} />} {label}
          </button>
        )}
      </div>
      {notice && <div className="note green" style={{ marginTop: 12 }}>{notice}</div>}
      {error && <div className="err">{error}</div>}
    </div>
  );
}
