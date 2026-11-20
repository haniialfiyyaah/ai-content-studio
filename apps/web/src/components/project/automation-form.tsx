"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "@/lib/client/api";
import { Spinner } from "@/components/ui/spinner";

export function AutomationForm({ projectId, enabled, everyDays }: { projectId: string; enabled: boolean; everyDays: number }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [days, setDays] = useState(everyDays);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save(nextOn = on, nextDays = days) {
    setError(null);
    start(async () => {
      try {
        await api(`/api/projects/${projectId}/automation`, "PATCH", { ideationEnabled: nextOn, everyDays: nextDays });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save");
      }
    });
  }

  return (
    <div>
      <div className="setting-line">
        <div>
          <div className="small semibold">Recurring ideation</div>
          <div className="xs muted">The agent drafts 3 new ideas on a cadence. New ideas always wait for your approval.</div>
        </div>
        <button
          className={`toggle ${on ? "on" : ""}`}
          aria-label="Toggle recurring ideation"
          disabled={pending}
          onClick={() => {
            setOn(!on);
            save(!on, days);
          }}
        />
      </div>
      <div className="setting-line">
        <div className="small semibold">Every</div>
        <select className="option-select" style={{ width: 140 }} value={days} disabled={pending} onChange={(e) => { const d = Number(e.target.value); setDays(d); save(on, d); }}>
          {[3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} days</option>)}
        </select>
      </div>
      {pending && <div className="xs muted row"><Spinner size={12} /> Saving…</div>}
      {error && <div className="err">{error}</div>}
    </div>
  );
}
