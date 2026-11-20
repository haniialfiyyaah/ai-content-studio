import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { FPS, TRANSITION_FRAMES, type CaptionWord, type ShortProps, type ShortScene } from "./types";

// Content-video template v2 — spec: .claude/skills/content-video/SKILL.md
const FONT = '"Noto Sans", "Inter", system-ui, sans-serif';
const MONO = '"DejaVu Sans Mono", "Noto Sans Mono", Menlo, monospace';
const SAFE_TOP = 230; // platform UI (search, title)
const SAFE_BOTTOM = 430; // platform UI (actions, description)
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.22, 1, 0.36, 1);

/** Frame ranges per beat (beat i starts where i-1 ends). */
export function sceneFrames(scenes: ShortScene[]) {
  let from = 0;
  return scenes.map((s) => {
    const duration = Math.max(1, Math.round(s.seconds * FPS));
    const range = { from, duration };
    from += duration;
    return range;
  });
}

// ---------------------------------------------------------------------------
// background + motion + transitions
// ---------------------------------------------------------------------------
function Background({ scene, index, duration, accent }: { scene: ShortScene; index: number; duration: number; accent: string }) {
  const frame = useCurrentFrame();
  const t = frame / duration;
  const m = scene.motion || "push-in";
  const dir = index % 2 === 0 ? 1 : -1;
  let scale = interpolate(t, [0, 1], [1.04, 1.16], clamp);
  let x = interpolate(t, [0, 1], [0, 14 * dir], clamp);
  if (/pull|out/i.test(m)) scale = interpolate(t, [0, 1], [1.2, 1.04], clamp);
  if (/pan/i.test(m)) {
    const left = /left/i.test(m) ? -1 : 1;
    x = interpolate(t, [0, 1], [70 * left, -70 * left], clamp);
    scale = 1.14;
  }
  if (/punch/i.test(m)) scale = interpolate(frame, [0, 6, 18], [1.28, 1.08, 1.1], { ...clamp, easing: ease }) + t * 0.05;
  const y = interpolate(t, [0, 1], [10, -10], clamp);

  return (
    <AbsoluteFill style={{ overflow: "hidden", background: "#120f1c" }}>
      {scene.imageUrl ? (
        <Img src={scene.imageUrl} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `translate(${x}px, ${y}px) scale(${scale})` }} />
      ) : (
        <DesignBackground accent={accent} index={index} />
      )}
      <AbsoluteFill
        style={{
          background:
            // darker where text lives (top half: layouts; ~62-80%: captions)
            "linear-gradient(180deg, rgba(10,8,20,.72) 0%, rgba(10,8,20,.5) 38%, rgba(10,8,20,.18) 52%, rgba(10,8,20,.35) 60%, rgba(10,8,20,.7) 78%, rgba(10,8,20,.85) 100%)",
        }}
      />
    </AbsoluteFill>
  );
}

/** Code-drawn branded background for `design` beats (and missing images). */
function DesignBackground({ accent, index }: { accent: string; index: number }) {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const orb = (cx: number, cy: number, r: number, color: string, speed: number, phase: number) => (
    <div
      style={{
        position: "absolute",
        left: cx + Math.sin(t * speed + phase) * 90 - r,
        top: cy + Math.cos(t * speed * 0.8 + phase) * 120 - r,
        width: r * 2,
        height: r * 2,
        borderRadius: "50%",
        background: color,
        filter: "blur(90px)",
        opacity: 0.75,
      }}
    />
  );
  const flip = index % 2 === 0;
  return (
    <AbsoluteFill style={{ background: "linear-gradient(160deg, #1d1833 0%, #120f1c 70%)", overflow: "hidden" }}>
      {orb(flip ? 260 : 820, 520, 380, accent, 0.6, index)}
      {orb(flip ? 860 : 220, 1300, 420, "#5b4bd6", 0.45, index + 2)}
      {orb(540, 1750, 300, "#2fb7a8", 0.5, index + 4)}
      <AbsoluteFill
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,.14) 2px, transparent 2px)",
          backgroundSize: "46px 46px",
          transform: `translateY(${(t * 14) % 46}px)`,
          opacity: 0.6,
        }}
      />
      {[0, 1, 2].map((k) => (
        <div
          key={k}
          style={{
            position: "absolute",
            left: [120, 780, 420][k],
            top: [380, 980, 1560][k] + Math.sin(t * 0.9 + k) * 30,
            width: [90, 130, 70][k],
            height: [90, 130, 70][k],
            border: `8px solid ${k === 1 ? accent : "rgba(255,255,255,.18)"}`,
            borderRadius: k === 2 ? "50%" : 28,
            transform: `rotate(${t * (k + 1) * 12}deg)`,
            opacity: 0.55,
          }}
        />
      ))}
    </AbsoluteFill>
  );
}

function Entrance({ transition, first, children }: { transition?: string; first: boolean; children: ReactNode }) {
  const frame = useCurrentFrame();
  if (first || !transition || transition === "cut") return <AbsoluteFill>{children}</AbsoluteFill>;
  const p = interpolate(frame, [0, TRANSITION_FRAMES], [0, 1], { ...clamp, easing: ease });
  let style: CSSProperties = {};
  if (transition === "slide") style = { transform: `translateX(${(1 - p) * 100}%)` };
  if (transition === "zoom") style = { transform: `scale(${1.35 - 0.35 * p})`, opacity: p };
  if (transition === "wipe") style = { clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` };
  const flash = transition === "flash" ? interpolate(frame, [0, 3, 10], [0, 0.95, 0], clamp) : 0;
  return (
    <AbsoluteFill style={style}>
      {children}
      {flash > 0 && <AbsoluteFill style={{ background: "#fff", opacity: flash }} />}
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------
// layouts (foreground)
// ---------------------------------------------------------------------------
const useIn = (delay = 0, damping = 13) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping } });
};

const HeadlinePill = ({ text, size = 58 }: { text: string; size?: number }) => (
  <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: size, color: "#fff", background: "rgba(15,12,28,.82)", padding: "12px 30px", borderRadius: 22, marginBottom: 24, textAlign: "center" }}>{text}</div>
);

const Zone = ({ top, children, style }: { top: number; children: ReactNode; style?: CSSProperties }) => (
  <div style={{ position: "absolute", left: 70, right: 70, top, display: "flex", flexDirection: "column", alignItems: "center", ...style }}>
    {children}
  </div>
);

function HookLayout({ text, accent }: { text: string; accent: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ws = text.split(/\s+/).filter(Boolean);
  return (
    <Zone top={SAFE_TOP + 120}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "8px 22px" }}>
        {ws.map((w, i) => {
          const s = spring({ frame: frame - i * 3, fps, config: { damping: 10, stiffness: 180 } });
          const last = i === ws.length - 1;
          return (
            <span
              key={i}
              style={{
                fontFamily: FONT,
                fontWeight: 900,
                fontSize: 112,
                lineHeight: 1.04,
                textTransform: "uppercase",
                color: "#fff",
                background: last ? accent : "transparent",
                padding: last ? "0 18px" : 0,
                borderRadius: 18,
                transform: `scale(${s}) rotate(${(1 - s) * (i % 2 ? 6 : -6)}deg)`,
                display: "inline-block",
                textShadow: last ? "none" : "0 8px 28px rgba(0,0,0,.55)",
                WebkitTextStroke: last ? "0" : "3px rgba(0,0,0,.65)",
                paintOrder: "stroke fill",
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
    </Zone>
  );
}

function Card({ children, accent, delay = 0, style }: { children: ReactNode; accent: string; delay?: number; style?: CSSProperties }) {
  const s = useIn(delay);
  return (
    <div
      style={{
        background: "rgba(255,255,255,.97)",
        borderRadius: 34,
        padding: "34px 40px",
        borderBottom: `12px solid ${accent}`,
        boxShadow: "0 30px 80px rgba(0,0,0,.4)",
        transform: `translateY(${(1 - s) * 120}px) scale(${0.9 + s * 0.1})`,
        opacity: s,
        width: "100%",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function StatementLayout({ text, accent }: { text: string; accent: string }) {
  const frame = useCurrentFrame();
  const underline = interpolate(frame, [8, 24], [0, 100], { ...clamp, easing: ease });
  return (
    <Zone top={SAFE_TOP + 90}>
      <Card accent={accent}>
        <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 78, lineHeight: 1.1, color: "#1f1a33", textAlign: "center" }}>{text}</div>
        <div style={{ height: 10, borderRadius: 10, background: accent, width: `${underline}%`, margin: "18px auto 0" }} />
      </Card>
    </Zone>
  );
}

function PointsLayout({ points, headline, accent, duration }: { points: string[]; headline?: string; accent: string; duration: number }) {
  const step = Math.max(8, Math.floor((duration * 0.7) / Math.max(1, points.length)));
  return (
    <Zone top={SAFE_TOP + 40}>
      {headline ? <HeadlinePill text={headline} size={62} /> : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 22, width: "100%" }}>
        {points.slice(0, 4).map((p, i) => (
          <PointRow key={i} text={p} n={i + 1} delay={6 + i * step} accent={accent} />
        ))}
      </div>
    </Zone>
  );
}

function PointRow({ text, n, delay, accent }: { text: string; n: number; delay: number; accent: string }) {
  const s = useIn(delay, 12);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 24,
        background: "rgba(255,255,255,.96)",
        borderRadius: 28,
        padding: "22px 28px",
        boxShadow: "0 18px 50px rgba(0,0,0,.35)",
        transform: `translateX(${(1 - s) * -140}px)`,
        opacity: s,
      }}
    >
      <span style={{ width: 70, height: 70, borderRadius: 999, background: accent, color: "#fff", fontFamily: FONT, fontWeight: 900, fontSize: 40, display: "grid", placeItems: "center", flex: "none" }}>{n}</span>
      <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 50, color: "#1f1a33", lineHeight: 1.15 }}>{text}</span>
    </div>
  );
}

function CodeLayout({ code, headline, accent, duration }: { code: string; headline?: string; accent: string; duration: number }) {
  const frame = useCurrentFrame();
  const lines = code.split("\n").slice(0, 8);
  const total = lines.join("\n").length;
  const shown = Math.floor(interpolate(frame, [6, Math.max(12, duration * 0.6)], [0, total], clamp));
  let budget = shown;
  const s = useIn(0);
  return (
    <Zone top={SAFE_TOP + 40}>
      {headline ? <HeadlinePill text={headline} /> : null}
      <div
        style={{
          width: "100%",
          background: "#17142a",
          borderRadius: 30,
          padding: "26px 34px 34px",
          boxShadow: "0 30px 80px rgba(0,0,0,.5)",
          border: `3px solid ${accent}`,
          transform: `scale(${0.85 + s * 0.15})`,
          opacity: s,
        }}
      >
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => <span key={c} style={{ width: 20, height: 20, borderRadius: 99, background: c }} />)}
        </div>
        {lines.map((line, i) => {
          const visible = line.slice(0, Math.max(0, budget));
          budget -= line.length + 1;
          const active = budget < 0 && visible.length > 0;
          return (
            <div key={i} style={{ fontFamily: MONO, fontSize: 40, lineHeight: 1.45, color: "#e9e4ff", whiteSpace: "pre", background: active ? `${accent}33` : "transparent", borderRadius: 8, minHeight: 58 }}>
              {visible}
              {active && frame % 16 < 8 ? <span style={{ color: accent }}>▌</span> : null}
            </div>
          );
        })}
      </div>
    </Zone>
  );
}

function CompareLayout({ left, right, accent, duration }: { left: string; right: string; accent: string; duration: number }) {
  const row = (label: string, text: string, good: boolean, delay: number) => (
    <Card accent={good ? "#2fbf71" : "#e5484d"} delay={delay} style={{ display: "flex", alignItems: "center", gap: 26, padding: "28px 34px" }}>
      <span style={{ fontSize: 76, flex: "none" }}>{good ? "✅" : "❌"}</span>
      <div>
        <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 28, letterSpacing: 2, color: good ? "#2fbf71" : "#e5484d" }}>{label}</div>
        <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 52, color: "#1f1a33", lineHeight: 1.12 }}>{text}</div>
      </div>
    </Card>
  );
  return (
    <Zone top={SAFE_TOP + 60} style={{ gap: 28 }}>
      {left ? row("INSTEAD OF", left, false, 4) : null}
      {right ? row("DO THIS", right, true, Math.max(14, Math.floor(duration * 0.4))) : null}
      <div style={{ height: 8, width: 160, borderRadius: 8, background: accent, opacity: 0.9 }} />
    </Zone>
  );
}

function StatLayout({ stat, label, accent }: { stat: string; label: string; accent: string }) {
  const frame = useCurrentFrame();
  const m = stat.match(/^([^\d-]*)(-?[\d.,]+)(.*)$/);
  const target = m ? Number(m[2].replace(/,/g, "")) : NaN;
  const value = Number.isFinite(target) ? interpolate(frame, [4, 34], [0, target], { ...clamp, easing: ease }) : NaN;
  const shown = Number.isFinite(value)
    ? `${m![1]}${Number.isInteger(target) ? Math.round(value).toLocaleString("en-US") : value.toFixed(1)}${m![3]}`
    : stat;
  const s = useIn(0, 9);
  return (
    <Zone top={SAFE_TOP + 150}>
      <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 220, color: "#fff", lineHeight: 1, textShadow: `0 0 60px ${accent}`, transform: `scale(${0.6 + s * 0.4})` }}>{shown}</div>
      <div style={{ marginTop: 20, background: accent, color: "#fff", fontFamily: FONT, fontWeight: 800, fontSize: 48, padding: "12px 28px", borderRadius: 18, textAlign: "center" }}>{label}</div>
    </Zone>
  );
}

function QuoteLayout({ text, accent }: { text: string; accent: string }) {
  if (!text) return null;
  return (
    <Zone top={SAFE_TOP + 70}>
      <Card accent={accent} style={{ borderRadius: "40px 40px 40px 6px" }}>
        <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 62, lineHeight: 1.18, color: "#1f1a33" }}>“{text}”</div>
      </Card>
    </Zone>
  );
}

function ProductLayout({ points, headline, accent }: { points: string[]; headline?: string; accent: string }) {
  const tags = (points.length ? points : headline ? [headline] : []).slice(0, 3);
  const spots = [
    { top: SAFE_TOP + 120, left: 60 },
    { top: SAFE_TOP + 360, right: 60 },
    { top: SAFE_TOP + 600, left: 90 },
  ];
  return (
    <>
      {tags.map((t, i) => (
        <Tag key={i} text={t} delay={6 + i * 12} accent={accent} style={{ position: "absolute", ...spots[i] }} />
      ))}
    </>
  );
}

function Tag({ text, delay, accent, style }: { text: string; delay: number; accent: string; style: CSSProperties }) {
  const s = useIn(delay, 11);
  return (
    <div style={{ ...style, transform: `scale(${s})`, opacity: s, background: "#fff", borderRadius: 999, padding: "16px 30px", boxShadow: "0 16px 40px rgba(0,0,0,.35)", display: "flex", alignItems: "center", gap: 14 }}>
      <span style={{ width: 22, height: 22, borderRadius: 99, background: accent }} />
      <span style={{ fontFamily: FONT, fontWeight: 900, fontSize: 46, color: "#1f1a33" }}>{text}</span>
    </div>
  );
}

function LabelLayout({ text, accent }: { text: string; accent: string }) {
  const s = useIn(6, 12);
  if (!text) return null;
  return (
    <Zone top={SAFE_TOP + 20}>
      <span style={{ background: accent, color: "#fff", fontFamily: FONT, fontWeight: 900, fontSize: 48, padding: "14px 32px", borderRadius: 999, transform: `translateY(${(1 - s) * -40}px)`, opacity: s, boxShadow: "0 12px 30px rgba(0,0,0,.3)" }}>{text}</span>
    </Zone>
  );
}

function CtaLayout({ headline, handle, accent }: { headline: string; handle?: string; accent: string }) {
  const frame = useCurrentFrame();
  const s = useIn(0, 11);
  const bounce = Math.sin(frame / 4) * 12;
  return (
    <AbsoluteFill style={{ background: "rgba(10,8,20,.62)" }}>
      <Zone top={SAFE_TOP + 260}>
        {handle ? <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 46, color: "rgba(255,255,255,.85)", marginBottom: 18, opacity: s }}>{handle}</div> : null}
        <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 96, lineHeight: 1.05, color: "#fff", textAlign: "center", transform: `scale(${0.8 + s * 0.2})` }}>{headline || "Follow for more"}</div>
        <div style={{ marginTop: 36, background: accent, color: "#fff", fontFamily: FONT, fontWeight: 900, fontSize: 50, padding: "20px 46px", borderRadius: 999, transform: `translateY(${bounce}px)`, boxShadow: `0 18px 50px ${accent}88` }}>
          FOLLOW ＋
        </div>
      </Zone>
    </AbsoluteFill>
  );
}

function Foreground({ scene, accent, duration, handle }: { scene: ShortScene; accent: string; duration: number; handle?: string }) {
  const layout = scene.layout ?? "image";
  const headline = scene.headline || scene.onScreenText || "";
  switch (layout) {
    case "hook":
      return headline ? <HookLayout text={headline} accent={accent} /> : null;
    case "statement":
      return headline ? <StatementLayout text={headline} accent={accent} /> : null;
    case "points":
      return scene.points?.length ? <PointsLayout points={scene.points} headline={scene.headline} accent={accent} duration={duration} /> : <LabelLayout text={headline} accent={accent} />;
    case "code":
      return scene.code ? <CodeLayout code={scene.code} headline={scene.headline} accent={accent} duration={duration} /> : <LabelLayout text={headline} accent={accent} />;
    case "compare":
      return scene.left || scene.right ? <CompareLayout left={scene.left ?? ""} right={scene.right ?? ""} accent={accent} duration={duration} /> : <LabelLayout text={headline} accent={accent} />;
    case "stat":
      return scene.stat ? <StatLayout stat={scene.stat} label={scene.statLabel || headline} accent={accent} /> : <LabelLayout text={headline} accent={accent} />;
    case "quote":
      return <QuoteLayout text={headline} accent={accent} />;
    case "product":
      return <ProductLayout points={scene.points ?? []} headline={scene.headline} accent={accent} />;
    case "cta":
      return <CtaLayout headline={headline} handle={handle} accent={accent} />;
    default:
      return <LabelLayout text={headline} accent={accent} />;
  }
}

/** Layouts whose content sits mid-screen push captions lower. */
const BUSY = new Set(["points", "code", "compare", "stat", "statement", "quote", "cta"]);

// ---------------------------------------------------------------------------
// captions (TikTok style)
// ---------------------------------------------------------------------------
function Captions({ words, accent, emphasis, lower }: { words: CaptionWord[]; accent: string; emphasis: Set<string>; lower: boolean }) {
  const frame = useCurrentFrame();
  const now = frame / FPS;
  if (!words.length) return null;
  const pages: CaptionWord[][] = [];
  let cur: CaptionWord[] = [];
  for (const w of words) {
    cur.push(w);
    if (cur.length >= 3 || /[.!?,]$/.test(w.text)) {
      pages.push(cur);
      cur = [];
    }
  }
  if (cur.length) pages.push(cur);
  const page = pages.find((p) => now >= p[0].start - 0.05 && now <= p[p.length - 1].end + 0.2);
  if (!page) return null;
  const top = lower ? 1920 - SAFE_BOTTOM - 150 : 1180;
  return (
    <div style={{ position: "absolute", left: 50, right: 50, top, display: "flex", justifyContent: "center", flexWrap: "wrap", gap: "6px 18px" }}>
      {page.map((w, i) => {
        const active = now >= w.start - 0.02 && now <= w.end + 0.05;
        const clean = w.text.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
        const emph = emphasis.has(clean);
        const pop = active ? interpolate(now - w.start, [0, 0.1], [1.18, 1], clamp) : 1;
        return (
          <span
            key={`${w.start}-${i}`}
            style={{
              fontFamily: FONT,
              fontWeight: 900,
              fontSize: 86,
              textTransform: "uppercase",
              color: active ? (emph ? "#1f1a33" : accent) : "#fff",
              background: active && emph ? "#ffd84a" : "transparent",
              padding: "0 14px",
              borderRadius: 16,
              transform: `scale(${pop}) rotate(${active && emph ? -2 : 0}deg)`,
              WebkitTextStroke: active && emph ? "0" : "5px #000",
              paintOrder: "stroke fill",
              textShadow: "0 6px 18px rgba(0,0,0,.5)",
              display: "inline-block",
            }}
          >
            {w.text}
          </span>
        );
      })}
    </div>
  );
}

function ProgressBar({ accent, total }: { accent: string; total: number }) {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 12, background: "rgba(255,255,255,.2)" }}>
      <div style={{ height: "100%", width: `${(frame / total) * 100}%`, background: accent }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
export function Short(props: ShortProps) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const ranges = sceneFrames(props.scenes);
  const emphasis = new Set(props.scenes.flatMap((s) => s.emphasis ?? []).map((w) => w.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase()));
  const currentIdx = Math.max(0, ranges.findIndex((r) => frame >= r.from && frame < r.from + r.duration));
  const current = props.scenes[currentIdx === -1 ? props.scenes.length - 1 : currentIdx];

  return (
    <AbsoluteFill style={{ background: "#120f1c" }}>
      {props.scenes.map((scene, i) => {
        // each beat starts TRANSITION_FRAMES early and enters over the previous one
        const lead = i && scene.transition && scene.transition !== "cut" ? TRANSITION_FRAMES : 0;
        const from = Math.max(0, ranges[i].from - lead);
        const duration = ranges[i].duration + lead + (i === props.scenes.length - 1 ? 30 : 0);
        return (
          <Sequence key={i} from={from} durationInFrames={duration} name={`Beat ${i + 1} · ${scene.layout ?? "image"}`}>
            <Entrance transition={scene.transition} first={i === 0}>
              <Background scene={scene} index={i} duration={duration} accent={props.accent} />
              <Foreground scene={scene} accent={props.accent} duration={ranges[i].duration} handle={props.handle} />
            </Entrance>
          </Sequence>
        );
      })}
      <Captions words={props.words} accent={props.accent} emphasis={emphasis} lower={BUSY.has(current?.layout ?? "image")} />
      <ProgressBar accent={props.accent} total={durationInFrames} />
      {props.narrationUrl ? <Audio src={props.narrationUrl} /> : null}
      {props.musicUrl ? (
        <Audio
          src={props.musicUrl}
          loop
          volume={(f) => interpolate(f, [0, 20, durationInFrames - 25, durationInFrames], [0, props.narrationUrl ? 0.1 : 0.25, props.narrationUrl ? 0.1 : 0.25, 0], clamp)}
        />
      ) : null}
    </AbsoluteFill>
  );
}
