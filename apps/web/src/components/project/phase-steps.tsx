import { Check } from "lucide-react";

const PHASES = [
  ["setup", "Project setup"],
  ["plan", "Content concept"],
  ["storyboard", "Storyboards"],
  ["production", "Images & video"],
] as const;
export type Phase = (typeof PHASES)[number][0];

/** Where the project is: project setup → content concept → storyboards → images & video. */
export function PhaseSteps({ current }: { current: Phase }) {
  const at = PHASES.findIndex(([k]) => k === current);
  return (
    <div className="setup-steps phase-steps">
      {PHASES.map(([k, label], i) => (
        <div key={k} className={`setup-step ${i < at ? "done" : i === at ? "active" : ""}`}>
          <span className="setup-dot">{i < at ? <Check size={11} /> : i + 1}</span>
          {label}
        </div>
      ))}
    </div>
  );
}
