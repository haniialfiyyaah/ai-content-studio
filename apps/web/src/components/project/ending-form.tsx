"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CTA_LABELS, CTA_TYPES, type CtaType, type Ending } from "@acs/domain";
import { api } from "@/lib/client/api";
import { Spinner } from "@/components/ui/spinner";

/** How every Short in this project ends: call to action, @handle, website, series teaser. */
export function EndingForm({ projectId, initial, editable }: { projectId: string; initial: Ending; editable: boolean }) {
  const router = useRouter();
  const [e, setE] = useState<Ending>(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Ending>) => {
    setE((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  };

  function save() {
    setError(null);
    start(async () => {
      try {
        await api(`/api/projects/${projectId}/settings`, "PATCH", { ending: e });
        setSaved(true);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save");
      }
    });
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="formgrid">
        <div className="field">
          <label>Channel name / @handle</label>
          <input value={e.handle} disabled={!editable} placeholder="@yourchannel" maxLength={40} onChange={(x) => set({ handle: x.target.value })} />
        </div>
        <div className="field">
          <label>Call to action</label>
          <select className="option-select" value={e.cta} disabled={!editable} onChange={(x) => set({ cta: x.target.value as CtaType })}>
            {CTA_TYPES.map((t) => <option key={t} value={t}>{CTA_LABELS[t].label}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label>Your exact words (optional)</label>
        <input value={e.ctaText} disabled={!editable} placeholder={CTA_LABELS[e.cta].example} maxLength={120} onChange={(x) => set({ ctaText: x.target.value })} />
      </div>
      {e.cta === "visit" && (
        <div className="field">
          <label>Website</label>
          <input value={e.link} disabled={!editable} placeholder="shop.example.com" maxLength={120} onChange={(x) => set({ link: x.target.value })} />
        </div>
      )}
      <div className="setting-line">
        <div>
          <div className="small semibold">Series ending</div>
          <div className="xs muted">Each video teases the next one (“Next: the 3-ingredient sauce”) so viewers follow for the next episode.</div>
        </div>
        <button className={`toggle ${e.series ? "on" : ""}`} aria-label="Toggle series ending" disabled={!editable} onClick={() => set({ series: !e.series })} />
      </div>
      <div className="row between">
        <span className="xs muted">{saved ? "Saved — applies to new and revised content, and to the end screen of the next renders." : "Applies to new and revised content, and to the end screen of the next renders."}</span>
        {editable && (
          <button className="btn primary small" disabled={pending} onClick={save}>{pending ? <Spinner size={12} /> : null} Save ending</button>
        )}
      </div>
      {error && <div className="err">{error}</div>}
    </div>
  );
}
