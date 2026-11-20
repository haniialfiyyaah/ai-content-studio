// Props contract between the app (dispatchToRenderer) and the Short composition.
// Spec: .claude/skills/content-video/SKILL.md. Beat fields are optional so
// older jobs (image-only scenes) still render.

export type BeatLayout = "hook" | "statement" | "points" | "code" | "compare" | "stat" | "quote" | "product" | "image" | "cta";
export type BeatTransition = "cut" | "slide" | "zoom" | "flash" | "wipe";

export interface ShortScene {
  /** Signed image URL; null renders a branded gradient. */
  imageUrl: string | null;
  seconds: number;
  onScreenText: string;
  motion: string;
  layout?: BeatLayout;
  headline?: string;
  points?: string[];
  code?: string;
  left?: string;
  right?: string;
  stat?: string;
  statLabel?: string;
  emphasis?: string[];
  transition?: BeatTransition;
}

export interface CaptionWord {
  text: string;
  /** seconds from video start */
  start: number;
  end: number;
}

export interface ShortProps extends Record<string, unknown> {
  title: string;
  hook: string;
  accent: string;
  scenes: ShortScene[];
  narrationUrl: string | null;
  words: CaptionWord[];
  /** Optional royalty-free music bed (looped, ducked). */
  musicUrl?: string | null;
  /** Shown on the end card, e.g. project title or channel handle. */
  handle?: string;
  /** End screen of the last (cta) beat. */
  endCard?: EndCard;
  format?: string;
}

export type EndCardCta = "follow" | "subscribe" | "comment" | "save" | "link" | "visit";
export interface EndCard {
  /** Channel name / @handle. */
  handle: string;
  cta: EndCardCta;
  /** Button text, e.g. FOLLOW / SUBSCRIBE / LINK IN BIO. */
  button: string;
  /** Website shown for "visit". */
  link?: string;
  /** The recurring character (round avatar). */
  avatarUrl?: string | null;
  /** Series teaser: title of the next episode. */
  next?: string;
}

export const FPS = 30;
/** Transition length into a beat (frames); the previous beat stays visible underneath. */
export const TRANSITION_FRAMES = 10;

const words = (text: string, start: number, step = 0.36) =>
  text.split(" ").map((w, i) => ({ text: w, start: start + i * step, end: start + (i + 1) * step - 0.04 }));

export const defaultProps: ShortProps = {
  title: "oneOf vs anyOf",
  hook: "Your schema is lying to you.",
  accent: "#e8735a",
  handle: "Code by Hani",
  endCard: { handle: "@codebyhani", cta: "follow", button: "FOLLOW", avatarUrl: null, next: "oneOf in real APIs" },
  format: "explainer",
  narrationUrl: null,
  musicUrl: null,
  scenes: [
    { imageUrl: null, seconds: 2.4, onScreenText: "", motion: "punch", layout: "hook", headline: "Your schema is lying", transition: "cut" },
    { imageUrl: null, seconds: 3.4, onScreenText: "", motion: "push-in", layout: "compare", left: "anyOf → both match ✓", right: "oneOf → ambiguous ✗", transition: "slide" },
    { imageUrl: null, seconds: 3.6, onScreenText: "", motion: "pan-left", layout: "code", code: '"oneOf": [\n  { "$ref": "#/A" },\n  { "$ref": "#/B" }\n]', transition: "zoom" },
    { imageUrl: null, seconds: 3.2, onScreenText: "", motion: "pull-out", layout: "points", points: ["Exclusive shapes", "Clear intent", "Fewer surprises"], transition: "wipe" },
    { imageUrl: null, seconds: 2.2, onScreenText: "", motion: "push-in", layout: "cta", headline: "Follow for part 2", transition: "flash" },
  ],
  words: [
    ...words("Your schema is lying to you", 0.2),
    ...words("anyOf lets a payload match both shapes", 2.6),
    ...words("switch to oneOf and the validator catches it", 6.0),
    ...words("exclusive shapes clear intent fewer surprises", 9.6),
    ...words("follow for part two", 12.8),
  ],
};
