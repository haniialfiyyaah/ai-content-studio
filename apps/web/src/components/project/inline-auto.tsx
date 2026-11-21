"use client";

/**
 * A small Auto switch next to a continue button. It only remembers the choice;
 * nothing changes (no badge, no saving) until the continue button is clicked —
 * the button sends it along.
 */
export function InlineAuto({ on, onChange, label = "Auto", hint }: { on: boolean; onChange: (v: boolean) => void; label?: string; hint: string }) {
  return (
    <label className="inline-auto" title={hint}>
      <span className={`xs semibold ${on ? "on" : ""}`}>⚡ {label}</span>
      <button type="button" role="switch" aria-checked={on} aria-label={label} className={`toggle small ${on ? "on" : ""}`} onClick={() => onChange(!on)} />
    </label>
  );
}
