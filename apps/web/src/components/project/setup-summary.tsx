import { CTA_LABELS, parseEnding, type Concept, type CreativeKit } from "@acs/domain";

type Part = "concept" | "kit" | "pillars";

/** The project setup, read-only (after the lock, or when viewing a finished step). */
export function SetupSummary({
  concept,
  kit,
  ending,
  only,
}: {
  concept: Partial<Concept>;
  kit: Partial<CreativeKit>;
  ending: unknown;
  only?: Part;
}) {
  const show = (p: Part) => !only || only === p;
  const e = parseEnding(ending);

  return (
    <div className="stack" style={{ gap: 14 }}>
      {show("concept") && (
        <section className="card pad setup-card">
          <div className="eyebrow">Concept · what &amp; for whom</div>
          <h2 className="setup-title">{concept.emoji} {concept.title}</h2>
          {concept.summary && <p className="small muted line">{concept.summary}</p>}
          <div className="setup-grid">
            <Field label="Niche" value={concept.niche} />
            <Field label="Audience" value={concept.audience} />
            <Field label="Goal" value={concept.goal} />
            <Field label="Content language" value={concept.language} />
          </div>
        </section>
      )}
      {show("kit") && (
        <section className="card pad setup-card">
          <div className="eyebrow">Creative Kit · how it looks &amp; sounds</div>
          <div className="setup-grid">
            <Field label="Tone" value={kit.tone} />
            <Field label="Format" value={kit.format} />
            <Field label="Narrator voice" value={kit.voice} wide />
            <Field label="Visual style" value={kit.visualStyle} wide />
            <Field label="Palette" value={kit.palette} />
            <Field label="Recurring character" value={kit.recurringSubject || "None (abstract visuals)"} />
            <Field label="Opening" value={kit.opening} />
            <Field label="Ending" value={`${CTA_LABELS[e.cta].label}${e.series ? " · teases the next video" : ""}`} />
          </div>
        </section>
      )}
      {show("pillars") && (
        <section className="card pad setup-card">
          <div className="eyebrow">Pillars &amp; guardrails</div>
          <div className="setup-grid">
            <div className="setup-field wide">
              <label>Pillars</label>
              <ul className="setup-points">{(kit.pillars ?? []).map((x) => <li key={x}><span>{x}</span></li>)}</ul>
            </div>
            <div className="setup-field wide">
              <label>Guardrails</label>
              <ul className="setup-points">{(kit.guardrails ?? []).map((x) => <li key={x}><span>{x}</span></li>)}</ul>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function Field({ label, value, wide }: { label: string; value?: string; wide?: boolean }) {
  if (!value) return null;
  return (
    <div className={`setup-field ${wide ? "wide" : ""}`}>
      <label>{label}</label>
      <div className="small line">{value}</div>
    </div>
  );
}
