import type { Scene } from "@acs/domain";

/** First spoken sentence — what a hook / statement frame says when there's no headline. */
const firstLine = (s: Scene) => (s.narration || "").split(/(?<=[.!?])\s/)[0]?.trim();

/**
 * A free storyboard sketch of one beat (9:16), drawn from the scene data —
 * where the text sits, where the subject goes. No image model involved.
 */
export function SketchFrame({ s, index }: { s: Scene; index: number }) {
  const big = s.headline || s.onScreenText || firstLine(s) || s.heading;
  const subject = s.background === "ai" && !["code", "stat", "compare"].includes(s.layout);
  return (
    <div className={`sk-frame sk-l-${s.layout}`} aria-label={`Scene ${index + 1}: ${s.heading}`}>
      <span className="sk-num">{index + 1}</span>
      {s.background === "design" && <span className="sk-tag">design</span>}

      {(s.layout === "hook" || s.layout === "statement") && <div className="sk-text sk-text-big">{big}</div>}
      {s.layout === "quote" && <div className="sk-text sk-quote">“{big}”</div>}
      {s.layout === "points" && (
        <ul className="sk-points">
          {(s.points.length ? s.points : [s.heading]).slice(0, 4).map((pt, i) => <li key={i}>{pt}</li>)}
        </ul>
      )}
      {s.layout === "code" && <pre className="sk-code">{(s.code || "// code").split("\n").slice(0, 6).join("\n")}</pre>}
      {s.layout === "compare" && (
        <div className="sk-compare">
          <div>{s.left || "Before"}</div>
          <span>vs</span>
          <div>{s.right || "After"}</div>
        </div>
      )}
      {s.layout === "stat" && (
        <div className="sk-stat">
          <strong>{s.stat || "##"}</strong>
          <span>{s.statLabel}</span>
        </div>
      )}
      {s.layout === "product" && <div className="sk-product"><span>product</span></div>}
      {s.layout === "cta" && (
        <div className="sk-cta">
          <span className="sk-avatar" />
          <span className="sk-button">{s.onScreenText || "Follow"}</span>
        </div>
      )}
      {subject && (
        <div className="sk-subject" title={s.visual}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden><path d="M2 2 L98 98 M98 2 L2 98" /></svg>
          <span>{s.visual || s.heading}</span>
        </div>
      )}
      {(s.layout === "image" || s.layout === "product") && s.onScreenText && <div className="sk-text sk-caption-line">{s.onScreenText}</div>}
      <span className="sk-secs">{s.seconds}s</span>
    </div>
  );
}

/** The back of a sketch frame: a plain description of the scene. */
export function SketchBack({ s, index }: { s: Scene; index: number }) {
  return (
    <div className="sk-frame sk-back" aria-label={`Scene ${index + 1} description`}>
      <span className="sk-num">{index + 1}</span>
      <p className="sk-back-text">{s.visual || s.heading}</p>
    </div>
  );
}
