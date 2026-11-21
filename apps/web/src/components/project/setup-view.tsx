"use client";

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
import { Spinner } from "@/components/ui/spinner";

const STEPS = SETUP_STAGES.filter((s) => s !== "done");

const BUSY_TEXT: Record<SetupStage, string> = {
  discovery: "Thinking about your idea…",
  concept: "Sketching the concept — niche, audience and goal…",
  kit: "Building the Creative Kit — voice, look and format…",
  pillars: "Writing pillars and guardrails…",
  done: "Drafting your first content…",
};

const NEXT_LABEL: Record<SetupStage, string> = {
  discovery: "Skip to concept",
  concept: "Continue to Creative Kit",
  kit: "Continue to pillars",
  pillars: "Lock setup & draft content",
  done: "",
};

/** Pre-fills the agent chat (AgentPanel listens). */
export function compose(text: string) {
  window.dispatchEvent(new CustomEvent("acs:compose", { detail: text }));
}

export function SetupView({
  projectId,
  stage,
  busy,
  stale,
  idea,
  concept,
  kit,
  ending,
}: {
  projectId: string;
  stage: SetupStage;
  busy: boolean;
  stale: boolean;
  idea: string;
  concept: Partial<Concept>;
  kit: Partial<CreativeKit>;
  ending: unknown;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const at = STEPS.indexOf(stage as (typeof STEPS)[number]);
  const working = busy && !stale;
  const needRetry = stale || (!busy && stage !== "discovery" && !hasResult(stage, concept, kit));

  function act(action: "continue" | "retry") {
    setError(null);
    start(async () => {
      try {
        await api(`/api/projects/${projectId}/setup`, "POST", { action });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  const refine = (what: string) => compose(`${what}: `);
  const e = parseEnding(ending);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="setup-steps">
        {STEPS.map((s, i) => (
          <div key={s} className={`setup-step ${i < at ? "done" : i === at ? "active" : ""}`}>
            <span className="setup-dot">{i < at ? <Check size={12} /> : i + 1}</span>
            {SETUP_STAGE_LABELS[s]}
          </div>
        ))}
      </div>

      {/* Confirmed stages, compact */}
      {at > 1 && concept.title && (
        <Summary label="Concept" text={`${concept.emoji ?? ""} ${concept.title} — ${concept.niche ?? ""}`} />
      )}
      {at > 2 && kit.tone && <Summary label="Creative Kit" text={`${kit.tone} · ${kit.visualStyle ?? ""}`} />}

      <div className="card pad setup-card">
        {stage === "discovery" && (
          <>
            <div className="eyebrow">STEP 1 · YOUR IDEA</div>
            <h2 className="setup-title">Let&apos;s shape it together</h2>
            <p className="small muted line">
              Answer the agent&apos;s questions in the chat — who it&apos;s for, what you want people to do, how it should feel. Nothing is generated until you agree on the setup.
            </p>
            <div className="note" style={{ marginTop: 14 }}>“{idea}”</div>
          </>
        )}

        {stage !== "discovery" && working && (
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
              <Field label="Niche / theme" value={concept.niche} />
              <Field label="Audience" value={concept.audience} />
              <Field label="Goal" value={concept.goal} />
              <Field label="Language" value={concept.language} />
            </div>
          </>
        )}

        {stage === "kit" && !working && kit.tone && (
          <>
            <div className="eyebrow">STEP 3 · CREATIVE KIT — HOW IT LOOKS &amp; SOUNDS</div>
            <h2 className="setup-title">Creative Kit</h2>
            <div className="setup-grid">
              <Field label="Tone" value={kit.tone} />
              <Field label="Format" value={kit.format} />
              <Field label="Narrator & voice" value={kit.voice} wide />
              <Field label="Visual style" value={kit.visualStyle} wide />
              <Field label="Palette" value={kit.palette}>
                <Swatches palette={kit.palette ?? ""} />
              </Field>
              <Field label="Recurring character" value={kit.recurringSubject || "None — abstract visuals"} />
              <Field label="Opening" value={kit.opening} />
              <Field label="Ending" value={`${CTA_LABELS[e.cta].label}${e.series ? " · teases the next video" : ""}`} />
            </div>
          </>
        )}

        {stage === "pillars" && !working && !!kit.pillars?.length && (
          <>
            <div className="eyebrow">STEP 4 · PILLARS &amp; GUARDRAILS</div>
            <h2 className="setup-title">What every video stands on</h2>
            <div className="setup-grid">
              <div className="setup-field">
                <label>Content pillars</label>
                <ul className="setup-list">{kit.pillars.map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
              <div className="setup-field">
                <label>Guardrails</label>
                <ul className="setup-list">{(kit.guardrails ?? []).map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
            </div>
          </>
        )}

        {needRetry && (
          <div className="note amber" style={{ marginTop: 12 }}>
            {stale ? "The agent didn’t answer in time." : "This step didn’t finish."}{" "}
            <button className="btn small" disabled={pending} onClick={() => act("retry")}><RotateCcw size={12} /> Retry</button>
          </div>
        )}

        {!working && (stage === "discovery" || hasResult(stage, concept, kit)) && (
          <>
            <div className="divider" />
            <div className="row between" style={{ flexWrap: "wrap", gap: 10 }}>
              {stage === "discovery" ? (
                <span className="xs muted">The agent moves on by itself once the idea is clear.</span>
              ) : (
                <button className="btn soft" onClick={() => refine(`Refine the ${SETUP_STAGE_LABELS[stage].toLowerCase()}`)}>
                  <Pencil size={13} /> Refine
                </button>
              )}
              <button className={`btn ${stage === "discovery" ? "" : "primary"}`} disabled={pending} onClick={() => act("continue")}>
                {pending ? <Spinner size={13} /> : null} {NEXT_LABEL[stage]} <ArrowRight size={14} />
              </button>
            </div>
          </>
        )}
        {error && <div className="err">{error}</div>}
      </div>
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

function Field({ label, value, wide, children }: { label: string; value?: string; wide?: boolean; children?: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className={`setup-field ${wide ? "wide" : ""}`}>
      <label>{label}</label>
      <div className="small line">{value}</div>
      {children}
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
