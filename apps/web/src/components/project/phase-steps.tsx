import Link from "next/link";
import { Check } from "lucide-react";

const PHASES = [
  ["setup", "Project setup"],
  ["plan", "Content concept"],
  ["storyboard", "Storyboards"],
  ["production", "Video"],
] as const;
export type Phase = (typeof PHASES)[number][0];

/**
 * Where the project is: project setup → content concept → storyboards (with images) → video.
 * Finished steps open read-only (?view=<step>); the current step returns to work.
 */
export function PhaseSteps({ current, projectId, viewing }: { current: Phase; projectId?: string; viewing?: Phase | null }) {
  const at = PHASES.findIndex(([k]) => k === current);
  return (
    <div className="setup-steps phase-steps">
      {PHASES.map(([k, label], i) => {
        const cls = `setup-step ${i < at ? "done" : i === at ? "active" : ""} ${viewing === k ? "viewing" : ""}`;
        const inner = (
          <>
            <span className="setup-dot">{i < at ? <Check size={11} /> : i + 1}</span>
            {label}
          </>
        );
        if (!projectId || i > at) return <div key={k} className={cls}>{inner}</div>;
        const href = i === at ? `/projects/${projectId}` : `/projects/${projectId}?view=${k}`;
        return <Link key={k} href={href} scroll={false} className={`${cls} clickable`} title={i < at ? `View ${label.toLowerCase()} (read-only)` : undefined}>{inner}</Link>;
      })}
    </div>
  );
}
