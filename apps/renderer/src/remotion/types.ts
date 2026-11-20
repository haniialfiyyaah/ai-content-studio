export interface ShortScene {
  /** Public/signed image URL; null renders a branded gradient fallback. */
  imageUrl: string | null;
  seconds: number;
  onScreenText: string;
  motion: string;
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
}

export const FPS = 30;

export const defaultProps: ShortProps = {
  title: "Curious Cat Tales",
  hook: "What happens when a cat finds a keyboard?",
  accent: "#7056d9",
  narrationUrl: null,
  scenes: [
    { imageUrl: null, seconds: 4, onScreenText: "Meet Mochi", motion: "push-in" },
    { imageUrl: null, seconds: 4, onScreenText: "Curiosity wins", motion: "pan" },
    { imageUrl: null, seconds: 4, onScreenText: "Follow for more", motion: "pull-out" },
  ],
  words: "Meet Mochi the curious cat who just discovered a brand new keyboard"
    .split(" ")
    .map((text, i) => ({ text, start: 0.4 + i * 0.4, end: 0.4 + i * 0.4 + 0.38 })),
};
