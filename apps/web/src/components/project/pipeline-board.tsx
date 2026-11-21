import Link from "next/link";
import { Bell, Loader2, Plus } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { STAGES, STAGE_HELP, STAGE_LABELS, type Stage } from "@/lib/pipeline";

export interface BoardItem {
  id: string;
  n: number;
  title: string;
  hook: string;
  stage: Stage;
  line: string;
  needsYou: boolean;
  busy: boolean;
  slot: string | null;
}

/** The project pipeline: one column per stage, one card per content (click → side panel). */
export function PipelineBoard({
  projectId,
  items,
  selectedId,
  editable,
  ideating,
}: {
  projectId: string;
  items: BoardItem[];
  selectedId?: string;
  editable: boolean;
  ideating: boolean;
}) {
  const ideas = items.filter((i) => i.stage === "ideas").length;
  return (
    <div className="board">
      {STAGES.map((stage) => {
        const col = items.filter((i) => i.stage === stage);
        return (
          <section key={stage} className="board-col">
            <header className="board-head">
              <div>
                <div className="row" style={{ gap: 6 }}>
                  <span className="board-title">{STAGE_LABELS[stage]}</span>
                  {col.length > 0 && <span className="board-count">{col.length}</span>}
                </div>
                <div className="tiny muted">{STAGE_HELP[stage]}</div>
              </div>
            </header>
            {stage === "ideas" && editable && (
              <div className="stack" style={{ gap: 6 }}>
                {ideas > 0 && (
                  <Link href={`/projects/${projectId}?launch=1`} scroll={false} className="btn small primary" style={{ width: "100%" }}>
                    Approve &amp; schedule ({ideas})
                  </Link>
                )}
                <ActionButton path={`/api/projects/${projectId}/ideas`} body={{ count: 3 }} className="btn small soft" disabled={ideating}>
                  {ideating ? <><Loader2 size={12} className="spin" /> Drafting ideas…</> : <><Plus size={12} /> New ideas</>}
                </ActionButton>
              </div>
            )}
            <div className="board-cards">
              {col.map((i) => (
                <Link
                  key={i.id}
                  href={`/projects/${projectId}?c=${i.id}`}
                  scroll={false}
                  className={`board-card ${selectedId === i.id ? "on" : ""} ${i.needsYou ? "needs" : ""}`}
                >
                  <div className="row between" style={{ gap: 6 }}>
                    <span className="tiny muted semibold">#{i.n}</span>
                    {i.needsYou && <Bell size={11} className="needs-icon" />}
                    {i.busy && <Loader2 size={11} className="spin muted" />}
                  </div>
                  <div className="small semibold board-card-title">{i.title}</div>
                  {stage === "ideas" && i.hook && <div className="tiny muted board-card-hook">“{i.hook}”</div>}
                  <div className={`tiny ${i.needsYou ? "needs-text" : "muted"}`}>{i.line}</div>
                  {i.slot && <div className="tiny faint">📅 {i.slot}</div>}
                </Link>
              ))}
              {!col.length && <div className="board-empty tiny faint">{stage === "ideas" && ideating ? "New ideas appear here…" : "—"}</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
