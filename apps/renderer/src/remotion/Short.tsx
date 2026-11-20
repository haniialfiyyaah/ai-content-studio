import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { FPS, type CaptionWord, type ShortProps, type ShortScene } from "./types";

const FONT = '"Noto Sans", "Inter", system-ui, sans-serif';
const FADE = 10;

/** Frame ranges per scene (scene i starts where i-1 ends). */
export function sceneFrames(scenes: ShortScene[]) {
  let from = 0;
  return scenes.map((s) => {
    const duration = Math.max(1, Math.round(s.seconds * FPS));
    const range = { from, duration };
    from += duration;
    return range;
  });
}

function KenBurns({ scene, index, duration }: { scene: ShortScene; index: number; duration: number }) {
  const frame = useCurrentFrame();
  const t = frame / duration;
  const pull = /pull|out/i.test(scene.motion);
  const scale = pull ? interpolate(t, [0, 1], [1.18, 1.02]) : interpolate(t, [0, 1], [1.02, 1.16]);
  const dir = index % 2 === 0 ? 1 : -1;
  const x = /pan|slide|track/i.test(scene.motion) ? interpolate(t, [0, 1], [-40 * dir, 40 * dir]) : interpolate(t, [0, 1], [0, 12 * dir]);
  const y = interpolate(t, [0, 1], [8, -8]);
  const opacity = index === 0 ? 1 : interpolate(frame, [0, FADE], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ opacity, overflow: "hidden" }}>
      {scene.imageUrl ? (
        <Img
          src={scene.imageUrl}
          style={{ width: "100%", height: "100%", objectFit: "cover", transform: `translate(${x}px, ${y}px) scale(${scale})` }}
        />
      ) : (
        <AbsoluteFill
          style={{
            background: `linear-gradient(${150 + index * 40}deg, #2b2440, #7056d9 55%, #f6b8a2)`,
            transform: `scale(${scale})`,
          }}
        />
      )}
      {/* readability vignette for captions */}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,.35) 0%, rgba(0,0,0,0) 28%, rgba(0,0,0,0) 55%, rgba(0,0,0,.6) 100%)" }} />
    </AbsoluteFill>
  );
}

function SceneLabel({ text, accent }: { text: string; accent: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!text) return null;
  const s = spring({ frame: frame - 6, fps, config: { damping: 14 } });
  return (
    <div
      style={{
        position: "absolute",
        top: 170,
        left: 70,
        right: 70,
        display: "flex",
        justifyContent: "center",
        transform: `translateY(${(1 - s) * -40}px)`,
        opacity: s,
      }}
    >
      <span style={{ background: accent, color: "#fff", fontFamily: FONT, fontWeight: 800, fontSize: 46, padding: "14px 30px", borderRadius: 999, boxShadow: "0 12px 30px rgba(0,0,0,.25)" }}>
        {text}
      </span>
    </div>
  );
}

function HookCard({ hook, accent }: { hook: string; accent: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 12 } });
  const exit = interpolate(frame, [52, 62], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 80, opacity: exit }}>
      <div
        style={{
          transform: `scale(${0.8 + enter * 0.2}) rotate(${(1 - enter) * -4}deg)`,
          background: "rgba(255,255,255,.96)",
          borderRadius: 40,
          padding: "48px 56px",
          borderBottom: `14px solid ${accent}`,
          boxShadow: "0 30px 80px rgba(0,0,0,.35)",
        }}
      >
        <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 76, lineHeight: 1.08, color: "#1f1a33", textAlign: "center" }}>{hook}</div>
      </div>
    </AbsoluteFill>
  );
}

/** Word-by-word captions, 3 words per page, active word highlighted. */
function Captions({ words, accent }: { words: CaptionWord[]; accent: string }) {
  const frame = useCurrentFrame();
  const now = frame / FPS;
  if (!words.length) return null;
  const pages: CaptionWord[][] = [];
  for (let i = 0; i < words.length; i += 3) pages.push(words.slice(i, i + 3));
  const page = pages.find((p) => now >= p[0].start - 0.05 && now <= p[p.length - 1].end + 0.25);
  if (!page) return null;
  return (
    <div style={{ position: "absolute", left: 60, right: 60, bottom: 330, display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 18 }}>
      {page.map((w, i) => {
        const active = now >= w.start && now <= w.end + 0.05;
        const pop = active ? interpolate(now - w.start, [0, 0.12], [1.18, 1], { extrapolateRight: "clamp" }) : 1;
        return (
          <span
            key={`${w.start}-${i}`}
            style={{
              fontFamily: FONT,
              fontWeight: 900,
              fontSize: 84,
              textTransform: "uppercase",
              color: active ? "#fff" : "#fff",
              background: active ? accent : "transparent",
              padding: "2px 18px",
              borderRadius: 18,
              transform: `scale(${pop})`,
              WebkitTextStroke: active ? "0" : "4px #000",
              paintOrder: "stroke fill",
              textShadow: "0 6px 18px rgba(0,0,0,.45)",
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
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 14, background: "rgba(255,255,255,.25)" }}>
      <div style={{ height: "100%", width: `${(frame / total) * 100}%`, background: accent }} />
    </div>
  );
}

export function Short(props: ShortProps) {
  const { durationInFrames } = useVideoConfig();
  const ranges = sceneFrames(props.scenes);
  return (
    <AbsoluteFill style={{ background: "#120f1c" }}>
      {props.scenes.map((scene, i) => (
        <Sequence key={i} from={Math.max(0, ranges[i].from - (i ? FADE : 0))} durationInFrames={ranges[i].duration + (i ? FADE : 0)}>
          <KenBurns scene={scene} index={i} duration={ranges[i].duration + (i ? FADE : 0)} />
          {i > 0 || ranges[0].duration < 70 ? <SceneLabel text={scene.onScreenText} accent={props.accent} /> : null}
        </Sequence>
      ))}
      {props.hook ? (
        <Sequence from={0} durationInFrames={62}>
          <HookCard hook={props.hook} accent={props.accent} />
        </Sequence>
      ) : null}
      <Captions words={props.words} accent={props.accent} />
      <ProgressBar accent={props.accent} total={durationInFrames} />
      {props.narrationUrl ? <Audio src={props.narrationUrl} /> : null}
    </AbsoluteFill>
  );
}
