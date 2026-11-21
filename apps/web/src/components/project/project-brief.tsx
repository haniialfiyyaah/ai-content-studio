"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { CTA_LABELS, parseEnding, type CreativeKit } from "@acs/domain";

/**
 * The project name in the header; click it for the brief that was set up
 * (concept, Creative Kit, pillars & guardrails, format). Read-only: the setup is locked.
 */
export function ProjectBrief({
  title,
  emoji,
  kit,
  ending,
  format,
}: {
  title: string;
  emoji?: string | null;
  kit: Partial<CreativeKit>;
  ending: unknown;
  format?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const e = parseEnding(ending);
  const rows = (pairs: [string, string | undefined][]) =>
    pairs.filter(([, v]) => v).map(([k, v]) => (
      <div key={k} className="brief-row"><span className="brief-k">{k}</span><span className="brief-v">{v}</span></div>
    ));

  return (
    <div className="brief" ref={box}>
      <button className="brief-title" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{emoji ? `${emoji} ` : ""}{title}</span>
        <ChevronDown size={18} className={open ? "flip" : ""} />
      </button>
      {open && (
        <div className="brief-pop" role="dialog" aria-label="Project brief">
          <div className="brief-sec">
            <div className="eyebrow">Concept</div>
            {rows([["Niche", kit.niche], ["Audience", kit.audience], ["Goal", kit.goal], ["Content language", kit.language], ["Format", format ?? undefined]])}
          </div>
          <div className="brief-sec">
            <div className="eyebrow">Creative Kit</div>
            {rows([
              ["Tone", kit.tone],
              ["Narrator", kit.voice],
              ["Visual style", kit.visualStyle],
              ["Palette", kit.palette],
              ["Character", kit.recurringSubject],
              ["Video format", kit.format],
              ["Opening", kit.opening],
              ["Ending", `${CTA_LABELS[e.cta].label}${e.series ? " · teases the next video" : ""}`],
            ])}
          </div>
          <div className="brief-sec">
            <div className="eyebrow">Pillars</div>
            <ul className="setup-points">{(kit.pillars ?? []).map((x) => <li key={x}><span>{x}</span></li>)}</ul>
            <div className="eyebrow" style={{ marginTop: 12 }}>Guardrails</div>
            <ul className="setup-points">{(kit.guardrails ?? []).map((x) => <li key={x}><span>{x}</span></li>)}</ul>
          </div>
          <div className="tiny faint">The project setup is locked. New content follows it.</div>
        </div>
      )}
    </div>
  );
}
