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
      done: input.status !== "generating" && input.contentCount > 0,
    },
    {
      key: "approved",
      label: allApproved ? "All content approved" : `${input.approvedCount} of ${input.contentCount} content approved`,
      detail: "Pick the best options, then approve everything at once.",
      done: allApproved,
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
