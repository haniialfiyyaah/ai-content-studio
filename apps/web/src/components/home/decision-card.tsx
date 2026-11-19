import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { ConsentTrack } from "@/components/consent/consent-track";
import { AuthorizeSpendButton } from "@/components/consent/authorize-spend-button";
import type { DecisionRow } from "@/lib/overview/decision-queue";

/**
 * The agent's hand-off at the end of the thread: everything waiting on the
 * creator, then what the agent is still working on. Built from persisted state.
 */
export function DecisionCard({
  yourCall,
  withAgent,
  hasAnyConcepts,
}: {
  yourCall: DecisionRow[];
  withAgent: DecisionRow[];
  hasAnyConcepts: boolean;
}) {
  if (!hasAnyConcepts) return null;

  return (
    <div className="msg">
      <span className="msg-avatar" aria-hidden>
        <Sparkles className="size-4" />
      </span>
      <section className="decision-card" aria-labelledby="decisions-heading">
        <div className="decision-card-head">
          <h2 id="decisions-heading">
            {yourCall.length > 0 ? "These need your call" : "Nothing needs you right now"}
          </h2>
          <p>
            {yourCall.length} waiting on you · {withAgent.length} with me
          </p>
        </div>

        {yourCall.length > 0 ? (
          <DecisionList rows={yourCall} />
        ) : (
          <p className="decision-empty">
            Every concept is with me or finished. Tell me what to make next.
          </p>
        )}

        {withAgent.length > 0 ? (
          <>
            <h3 className="decision-group-title">Still working on</h3>
            <DecisionList rows={withAgent} />
          </>
        ) : null}
      </section>
    </div>
  );
}

function DecisionList({ rows }: { rows: DecisionRow[] }) {
  return (
    <ul className="decision-list">
      {rows.map((row) => (
        <li key={row.conceptId} className="decision-row">
          <div className="min-w-0">
            <p className="decision-project">
              <Link href={`/projects/${row.projectId}`}>{row.projectName}</Link>
            </p>
            <p className="decision-title">
              <Link href={`/content/${row.conceptId}`}>{row.title}</Link>
            </p>
          </div>

          <ConsentTrack gates={row.track.gates} />

          <div className="decision-action">
            {row.track.next?.kind === "authorize_spend" ? (
              <AuthorizeSpendButton projectId={row.projectId} />
            ) : row.track.next ? (
              <Link
                href={row.track.next.href}
                className={
                  row.track.waitingOn === "creator"
                    ? "primary-button primary-button--sm"
                    : "secondary-button secondary-button--sm"
                }
              >
                {row.track.next.label}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            ) : (
              <Link
                href={`/content/${row.conceptId}`}
                className="secondary-button secondary-button--sm"
              >
                Open
              </Link>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
