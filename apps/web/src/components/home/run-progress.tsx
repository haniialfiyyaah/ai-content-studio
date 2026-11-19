import Link from "next/link";
import { AlertTriangle, ArrowRight, Check, Sparkles } from "lucide-react";
import { isRunFinished, type PlanningRun } from "./use-planning-run";

type StepState = "done" | "current" | "failed";

interface StepView {
  key: string;
  label: string;
  state: StepState;
}

const STEP_STATE_TEXT: Record<StepState, string> = {
  done: "done",
  current: "in progress",
  failed: "stopped",
};

/**
 * Live view of a project_planning run inside the thread. Only steps the run
 * actually recorded are listed; nothing is predicted ahead of the server.
 */
export function RunProgress({ run }: { run: PlanningRun }) {
  const steps = toSteps(run);
  const failed = run.status === "failed";
  const finished = isRunFinished(run);
  const title = failed
    ? "Planning stopped"
    : run.status === "completed"
      ? "Your Project is ready"
      : run.status === "needs_input"
        ? "The agent needs your input"
        : "Creating your Project";

  return (
    <div className="msg">
      <span className="msg-avatar" aria-hidden>
        <Sparkles className="size-4" />
      </span>
      <div className="msg-body">
        <section className="run-card" aria-label="Project creation progress">
          <p className="run-title">{title}</p>
          <ol className="run-steps">
            {steps.map((step) => (
              <li key={step.key} className="run-step" data-state={step.state}>
                <span className="run-mark" aria-hidden>
                  {step.state === "done" ? <Check strokeWidth={3} /> : null}
                  {step.state === "failed" ? <AlertTriangle strokeWidth={2.5} /> : null}
                </span>
                <span>{step.label}</span>
                <span className="sr-only">, {STEP_STATE_TEXT[step.state]}</span>
              </li>
            ))}
          </ol>
          {run.timedOut && !finished ? (
            <p className="run-note">
              Still working. The Project will appear here once the agent finishes.
            </p>
          ) : null}
          {run.projectId ? (
            <Link href={`/projects/${run.projectId}`} className="msg-link">
              Open Project
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function toSteps(run: PlanningRun): StepView[] {
  if (run.events.length === 0) {
    return [
      {
        key: "queued",
        label: run.stage && run.stage !== "queued" ? humanize(run.stage) : "Queued",
        state: run.status === "failed" ? "failed" : "current",
      },
    ];
  }

  const lastIndex = run.events.length - 1;
  return run.events.map((event, index) => {
    const label = event.message?.trim() || humanize(event.stage ?? "working");
    let state: StepState = "done";
    if (index === lastIndex) {
      if (event.state === "failed" || run.status === "failed") state = "failed";
      else if (event.state !== "completed" && !isRunFinished(run)) state = "current";
    }
    return { key: String(event.sequence), label, state };
  });
}

function humanize(value: string): string {
  const text = value.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
