import { AlertTriangle, Check } from "lucide-react";
import type { ConsentGate } from "@/lib/consent-track";
import { cn } from "@/lib/utils";

const STATE_TEXT: Record<ConsentGate["state"], string> = {
  done: "done",
  current: "waiting on you",
  working: "in progress",
  blocked: "needs attention",
  todo: "not started",
};

/**
 * The four independent decisions a concept passes through. Marks are
 * decorative; each gate's state is also spelled out for assistive tech.
 */
export function ConsentTrack({
  gates,
  size = "compact",
  className,
}: {
  gates: ConsentGate[];
  size?: "compact" | "wide";
  className?: string;
}) {
  return (
    <ol
      className={cn("consent", size === "wide" && "consent--wide", className)}
      aria-label="Consent track"
    >
      {gates.map((gate) => (
        <li key={gate.id} className="consent-gate" data-state={gate.state}>
          <span className="consent-mark" aria-hidden>
            {gate.state === "done" ? <Check strokeWidth={3} /> : null}
            {gate.state === "blocked" ? <AlertTriangle strokeWidth={2.5} /> : null}
          </span>
          <span className="consent-label">{gate.label}</span>
          <span className="consent-detail">{gate.detail}</span>
          <span className="sr-only">, {STATE_TEXT[gate.state]}</span>
        </li>
      ))}
    </ol>
  );
}
