import {
  OPTION_FIELDS,
  type ContentOptions,
  type OptionField,
  type ProjectStatus,
  type Selection,
} from "./types";

/** The string currently chosen for a field (index clamped, defaults to 0). */
export function chosen(options: Partial<ContentOptions> | null | undefined, selection: Selection | null | undefined, field: OptionField): string {
  const list = options?.[field] ?? [];
  if (!list.length) return "";
  const idx = selection?.[field] ?? 0;
  return list[Math.min(Math.max(idx, 0), list.length - 1)] ?? list[0];
}

export function resolveContent(options: Partial<ContentOptions> | null | undefined, selection: Selection | null | undefined) {
  return Object.fromEntries(OPTION_FIELDS.map((f) => [f, chosen(options, selection, f)])) as Record<OptionField, string>;
}

export function isValidSelection(options: Partial<ContentOptions>, field: OptionField, index: number): boolean {
  const list = options[field] ?? [];
  return Number.isInteger(index) && index >= 0 && index < list.length;
}

export interface ReadinessInput {
  status: ProjectStatus;
  contentCount: number;
  approvedCount: number;
  hasSchedule: boolean;
  youtubeConnected: boolean;
}

export interface ReadinessStep {
  key: "generated" | "approved" | "scheduled" | "youtube";
  label: string;
  detail: string;
  done: boolean;
}

/** Project readiness checklist; activation requires every step done. */
export function readiness(input: ReadinessInput): { steps: ReadinessStep[]; canActivate: boolean } {
  const allApproved = input.contentCount > 0 && input.approvedCount === input.contentCount;
  const steps: ReadinessStep[] = [
    {
      key: "generated",
      label: "Content and Creative Kit generated",
      detail: input.contentCount ? `${input.contentCount} content ideas ready to review` : "Waiting for the agent",
      done: input.contentCount > 0,
    },
    {
      key: "approved",
      label: allApproved ? "All content approved" : `${input.approvedCount} of ${input.contentCount} content approved`,
      detail: allApproved || !input.approvedCount
        ? "Pick the best options, then approve. Skipped content stays as a draft and isn't published."
        : "Ready — skipped content stays as a draft and isn't published.",
      // At least one approved is enough; skipped (pending) content is simply not scheduled.
      done: input.approvedCount > 0,
    },
    {
      key: "scheduled",
      label: input.hasSchedule ? "Publishing schedule set" : "Set a publishing schedule",
      detail: "Choose publishing days and time; each content gets a slot.",
      done: input.hasSchedule,
    },
    {
      key: "youtube",
      label: input.youtubeConnected ? "YouTube connected" : "Connect YouTube",
      detail: "Videos are uploaded to your channel at each scheduled slot.",
      done: input.youtubeConnected,
    },
  ];
  return { steps, canActivate: input.status === "draft" && steps.every((s) => s.done) };
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, a: 1, an: 1, single: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  satu: 1, sebuah: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10,
};

/**
 * How many content ideas the creator asked for ("1 idea", "three videos",
 * "5 konten"), or null when the prompt doesn't say.
 */
export function inferContentCount(prompt: string): number | null {
  const m = prompt
    .toLowerCase()
    .match(/\b(\d{1,2}|one|an?|single|two|three|four|five|six|seven|eight|nine|ten|satu|sebuah|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh)\s+(?:\w+\s+)?(ideas?|videos?|shorts?|contents?|konten|ide|posts?|episodes?)\b/);
  if (!m) return null;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1]];
  return n ? Math.min(Math.max(n, 1), 12) : null;
}
