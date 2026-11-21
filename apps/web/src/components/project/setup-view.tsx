"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, Check, Pencil, RotateCcw } from "lucide-react";
import {
  CTA_LABELS,
  SETUP_STAGES,
  SETUP_STAGE_LABELS,
  parseEnding,
  type Concept,
  type CreativeKit,
  type SetupStage,
} from "@acs/domain";
import { api } from "@/lib/client/api";
import { compose } from "@/lib/client/compose";
import { Spinner } from "@/components/ui/spinner";
import { SetupSummary } from "./setup-summary";
import { InlineAuto } from "./inline-auto";

const STEPS = SETUP_STAGES.filter((s) => s !== "done");

const BUSY_TEXT: Record<SetupStage, string> = {
  similar: "Checking your other projects…",
  concept: "Sketching the concept — niche, audience and goal…",
  kit: "Building the Creative Kit — voice, look and format…",
  pillars: "Writing pillars and guardrails…",
  done: "Drafting your first content…",
};

const NEXT_LABEL: Record<SetupStage, string> = {
  similar: "Create a different project",
  concept: "Continue to Creative Kit",
  kit: "Continue to pillars",
  pillars: "Lock project setup",
  done: "",
};


export function SetupView({
  projectId,
  stage,
  busy,
  stale,
  idea,
  concept,
  kit,
  ending,
  similar,
  auto,
}: {
  projectId: string;
  stage: SetupStage;
  busy: boolean;
  stale: boolean;
  idea: string;
  concept: Partial<Concept>;
  kit: Partial<CreativeKit>;
  ending: unknown;
  /** The agent asked "continue in a similar project?" and it isn't answered yet. */
  similar?: { projectId: string; title: string } | null;
  auto?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<SetupStage | null>(null);
  const at = STEPS.indexOf(stage as (typeof STEPS)[number]);
  const working = busy && !stale;
  const needRetry = stale || (!busy && stage !== "similar" && !hasResult(stage, concept, kit));

  const similarPending = Boolean(similar);
  function act(action: "continue" | "retry" | "start_new" | "use_similar", targetId?: string) {
    setError(null);
    start(async () => {
      try {
        const r = await api<{ redirect?: string }>(`/api/projects/${projectId}/setup`, "POST", { action, targetId });
        if (r?.redirect) return router.push(r.redirect);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  const e = parseEnding(ending);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="setup-steps">
        {STEPS.map((s, i) => {
          const cls = `setup-step ${i < at ? "done" : i === at ? "active" : ""} ${viewing === s ? "viewing" : ""}`;
          const inner = (
            <>
              <span className="setup-dot">{i < at ? <Check size={12} /> : i + 1}</span>
              {SETUP_STAGE_LABELS[s]}
            </>
          );
          // Finished steps open read-only; the current step goes back to work.
          const viewable = (i < at && s !== "similar") || i === at;
          return viewable ? (
            <button key={s} type="button" className={`${cls} clickable`} onClick={() => setViewing(i === at ? null : s)}>{inner}</button>
          ) : (
            <div key={s} className={cls}>{inner}</div>
          );
        })}
      </div>

      {viewing && viewing !== stage && (
        <>
          <div className="view-banner">
            <span>Viewing {SETUP_STAGE_LABELS[viewing].toLowerCase()} · read-only</span>
            <button type="button" className="btn small" onClick={() => setViewing(null)}>Back to current step</button>
          </div>
          <SetupSummary concept={concept} kit={kit} ending={ending} only={viewing as "concept" | "kit" | "pillars"} />
        </>
      )}
      {(!viewing || viewing === stage) && (<>

      {/* Confirmed stages, compact */}
      {at > 1 && concept.title && (
        <Summary label="Concept" text={`${concept.emoji ?? ""} ${concept.title} — ${concept.niche ?? ""}`} />
      )}
      {at > 2 && kit.tone && <Summary label="Creative Kit" text={`${kit.tone} · ${kit.visualStyle ?? ""}`} />}

      <div className="card pad setup-card">
        {stage === "similar" && (
          <>
            <div className="eyebrow">STEP 1 · YOUR IDEA</div>
            <h2 className="setup-title">{busy && !stale ? "Checking your other projects…" : similarPending ? "Looks like one you already have" : "Your idea"}</h2>
            <p className="small muted line">
              {busy && !stale
                ? "So you don’t end up with duplicate videos. The concept is sketched right after."
                : similarPending
                  ? "Continue in that project, or create a different one — the concept is sketched as soon as you choose."
                  : "Tell the agent which way you want to go."}
            </p>
            <div className="note" style={{ marginTop: 14 }}>“{idea}”</div>
            {similar && !working && (
              <div className="similar-decide">
                <div className="similar-decide-proj">
                  <span className="xs muted">Your existing project</span>
                  <Link href={`/projects/${similar.projectId}`} target="_blank" className="small semibold">{similar.title} ↗</Link>
                </div>
                <div className="actions">
                  <button className="btn" disabled={pending} onClick={() => act("use_similar", similar.projectId)}>Continue there</button>
                  <button className="btn primary" disabled={pending} onClick={() => act("start_new")}>
                    {pending ? <Spinner size={13} /> : null} Create a different project <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {stage !== "similar" && working && (
          <div className="setup-busy">
            <Spinner size={18} />
            <div>
              <div className="semibold">{BUSY_TEXT[stage]}</div>
              <div className="xs muted">Usually 10–30 seconds. It appears here automatically.</div>
            </div>
          </div>
        )}

        {stage === "concept" && !working && concept.title && (
          <>
            <div className="eyebrow">STEP 2 · CONCEPT — WHAT &amp; FOR WHOM</div>
            <h2 className="setup-title">{concept.emoji} {concept.title}</h2>
            {concept.summary && <p className="small muted line">{concept.summary}</p>}
            <div className="setup-grid">
              <Field edit label="Niche" value={concept.niche} />
              <Field edit label="Audience" value={concept.audience} />
              <Field edit label="Goal" value={concept.goal} />
              <Field edit label="Content language" hint="scripts only" value={concept.language} />
            </div>
          </>
        )}

        {stage === "kit" && !working && kit.tone && (
          <>
            <div className="eyebrow">STEP 3 · CREATIVE KIT — HOW IT LOOKS &amp; SOUNDS</div>
            <h2 className="setup-title">Creative Kit</h2>
            <div className="setup-grid">
              <Field edit label="Tone" value={kit.tone} />
              <Field edit label="Format" value={kit.format} />
              <Field edit label="Narrator & voice" value={kit.voice} wide />
              <Field edit label="Visual style" value={kit.visualStyle} wide />
              <Field edit label="Palette" value={kit.palette}>
                <Swatches palette={kit.palette ?? ""} />
              </Field>
              <Field edit label="Recurring character" value={kit.recurringSubject || "None — abstract visuals"} />
              <Field edit label="Opening" value={kit.opening} />
              <Field edit label="Ending" value={`${CTA_LABELS[e.cta].label}${e.series ? " · teases the next video" : ""}`} />
            </div>
          </>
        )}

        {stage === "pillars" && !working && !!kit.pillars?.length && (
          <>
            <div className="eyebrow">STEP 4 · PILLARS &amp; GUARDRAILS</div>
            <h2 className="setup-title">What every video stands on</h2>
            <div className="setup-grid">
              <Points label="Pillars" items={kit.pillars} />
              <Points label="Guardrails" items={kit.guardrails ?? []} />
            </div>
          </>
        )}

        {needRetry && (
          <div className="note amber" style={{ marginTop: 12 }}>
            {stale ? "The agent didn’t answer in time." : "This step didn’t finish."}{" "}
            <button className="btn small" disabled={pending} onClick={() => act("retry")}><RotateCcw size={12} /> Retry</button>
          </div>
        )}

        {!working && !similarPending && (stage === "similar" || hasResult(stage, concept, kit)) && (
          <>
            <div className="divider" />
            <div className="row between" style={{ flexWrap: "wrap", gap: 10 }}>
              {stage === "similar" ? (
                <span className="xs muted">Or tell the agent which way you want to go.</span>
              ) : (
                <span className="xs muted">Tap ✏️ on any field to change it, or tell the agent.</span>
              )}
              <div className="foot-actions">
                {stage !== "similar" && (
                  <InlineAuto projectId={projectId} field="autoApprove" initial={Boolean(auto)} hint="Auto: the rest of the setup runs without stopping" />
                )}
                <button
                  className={`btn ${stage === "similar" ? "" : "primary"}`}
                  disabled={pending}
                  onClick={() => act(stage === "similar" ? "start_new" : "continue")}
                >
                  {pending ? <Spinner size={13} /> : null} {NEXT_LABEL[stage]} <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
        {error && <div className="err">{error}</div>}
      </div>
      </>)}
    </div>
  );
}

function hasResult(stage: SetupStage, concept: Partial<Concept>, kit: Partial<CreativeKit>) {
  if (stage === "concept") return Boolean(concept.title);
  if (stage === "kit") return Boolean(kit.tone);
  if (stage === "pillars") return Boolean(kit.pillars?.length);
  return false;
}

function Summary({ label, text }: { label: string; text: string }) {
  return (
    <div className="setup-summary">
      <span className="setup-dot done"><Check size={12} /></span>
      <span className="xs semibold">{label}</span>
      <span className="xs muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{text}</span>
    </div>
  );
}

function EditBtn({ text, size = 11 }: { text: string; size?: number }) {
  return (
    <button className="icbtn tinybtn" title={text.replace(/: $/, "")} onClick={() => compose(text)}>
      <Pencil size={size} />
    </button>
  );
}

function Field({ label, value, wide, edit, hint, children }: { label: string; value?: string; wide?: boolean; edit?: boolean; hint?: string; children?: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className={`setup-field ${wide ? "wide" : ""}`}>
      <div className="row between" style={{ gap: 6 }}>
        <label>{label}{hint ? <span className="faint" style={{ textTransform: "none", letterSpacing: 0 }}> · {hint}</span> : null}</label>
        {edit && <EditBtn text={`Change the ${label.toLowerCase()}: `} />}
      </div>
      <div className="small line">{value}</div>
      {children}
    </div>
  );
}

/** Short scannable points; ✏️ per point. */
function Points({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="setup-field">
      <div className="row between" style={{ gap: 6 }}>
        <label>{label}</label>
        <EditBtn text={`Change the ${label.toLowerCase()}: `} />
      </div>
      <ul className="setup-points">
        {items.map((x, i) => (
          <li key={i}>
            <span>{x}</span>
            <EditBtn size={10} text={`Change ${label.toLowerCase()} point ${i + 1} (“${x}”): `} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Colour chips for any hex codes in the palette text. */
function Swatches({ palette }: { palette: string }) {
  const hex = palette.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi) ?? [];
  if (!hex.length) return null;
  return (
    <div className="row" style={{ gap: 6, marginTop: 8 }}>
      {hex.slice(0, 6).map((h) => <span key={h} className="swatch" style={{ background: h }} title={h} />)}
    </div>
  );
}
