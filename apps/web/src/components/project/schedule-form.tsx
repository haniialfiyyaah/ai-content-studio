"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { WEEKDAYS, type Schedule } from "@acs/domain";
import { api } from "@/lib/client/api";
import { Spinner } from "@/components/ui/spinner";

const LABEL: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

export function ScheduleForm({ projectId, initial, timezone }: { projectId: string; initial: Partial<Schedule>; timezone: string }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [days, setDays] = useState<string[]>(initial.days ?? ["mon", "thu"]);
  const [time, setTime] = useState(initial.time ?? "10:00");
  const [startDate, setStartDate] = useState(initial.startDate ?? today);
  const [tz, setTz] = useState(initial.timezone ?? timezone);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setMsg(null);
    start(async () => {
      try {
        await api(`/api/projects/${projectId}/settings`, "PATCH", { schedule: { days, time, startDate, timezone: tz } });
        setMsg({ ok: true, text: "Schedule saved — every content now has a publishing slot." });
        router.refresh();
      } catch (e) {
        setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save" });
      }
    });
  }

  return (
    <div className="stack">
      <div className="field">
        <label>Publishing days</label>
        <div className="actions">
          {WEEKDAYS.map((d) => (
            <button
              key={d}
              type="button"
              className={`daychip ${days.includes(d) ? "on" : ""}`}
              onClick={() => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))}
            >
              {LABEL[d]}
            </button>
          ))}
        </div>
      </div>
      <div className="formgrid">
        <div className="field"><label>Time</label><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
        <div className="field"><label>Start date</label><input type="date" value={startDate} min={today} onChange={(e) => setStartDate(e.target.value)} /></div>
        <div className="field">
          <label>Timezone</label>
          <select value={tz} onChange={(e) => setTz(e.target.value)}>
            {["Asia/Jakarta", "Asia/Singapore", "Asia/Tokyo", "Europe/London", "America/New_York", "America/Los_Angeles", "UTC"].map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
        </div>
        <div className="field"><label>Destination</label><input value="YouTube Shorts" disabled /></div>
      </div>
      <div className="row">
        <button className="btn primary" onClick={save} disabled={pending || !days.length}>{pending ? <><Spinner /> Saving…</> : "Save schedule"}</button>
        {msg && <span className={msg.ok ? "xs" : "err"} style={msg.ok ? { color: "var(--green)" } : undefined}>{msg.text}</span>}
      </div>
    </div>
  );
}
