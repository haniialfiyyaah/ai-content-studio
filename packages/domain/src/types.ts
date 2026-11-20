import { z } from "zod";

// ---------------------------------------------------------------------------
// Status vocabularies (mirror DB CHECK constraints)
// ---------------------------------------------------------------------------
export const PROJECT_STATUSES = ["generating", "draft", "active", "paused", "stopped", "failed"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type RunStatus = "queued" | "running" | "succeeded" | "failed";
export type RunKind = "project_setup" | "ideation" | "research";
export type ContentStatus = "draft" | "approved" | "archived";
export type RenderStatus = "queued" | "rendering" | "ready" | "failed" | "cancelled";
export type PublishStatus = "scheduled" | "publishing" | "published" | "failed" | "cancelled";

/** Fields the AI offers several alternatives for; the user picks one per field. */
export const OPTION_FIELDS = ["title", "hook", "script", "caption", "hashtags"] as const;
export type OptionField = (typeof OPTION_FIELDS)[number];

export const OPTION_FIELD_LABELS: Record<OptionField, string> = {
  title: "Title",
  hook: "Opening hook",
  script: "Narration script",
  caption: "Post description",
  hashtags: "Hashtags",
};

// ---------------------------------------------------------------------------
// Generation contract (n8n → /api/internal/generation/complete)
// ---------------------------------------------------------------------------
const nonEmpty = z.string().trim().min(1);
const optionList = z.array(nonEmpty).min(1).max(5);

export const SceneSchema = z.object({
  heading: nonEmpty,
  narration: z.string().default(""),
  visual: z.string().default(""),
  onScreenText: z.string().default(""),
  motion: z.string().default(""),
  seconds: z.coerce.number().min(1).max(60).default(5),
});
export type Scene = z.infer<typeof SceneSchema>;

export const ContentOptionsSchema = z.object({
  title: optionList,
  hook: optionList,
  script: optionList,
  caption: optionList,
  hashtags: optionList,
});
export type ContentOptions = z.infer<typeof ContentOptionsSchema>;

export const GeneratedContentSchema = z.object({
  options: ContentOptionsSchema,
  scenes: z.array(SceneSchema).min(1).max(8),
  videoPrompt: nonEmpty,
});
export type GeneratedContent = z.infer<typeof GeneratedContentSchema>;

export const CreativeKitSchema = z.object({
  tone: z.string().default(""),
  audience: z.string().default(""),
  language: z.string().default("English"),
  visualStyle: z.string().default(""),
  voice: z.string().default(""),
  pillars: z.array(z.string()).default([]),
  guardrails: z.array(z.string()).default([]),
});
export type CreativeKit = z.infer<typeof CreativeKitSchema>;

export const ResearchAngleSchema = z.object({ title: nonEmpty, why: z.string().default("") });

export const GenerationCompleteSchema = z.object({
  runId: z.string().uuid(),
  project: z
    .object({
      title: nonEmpty.max(120),
      summary: z.string().max(600).default(""),
      emoji: z.string().max(8).optional(),
      creativeKit: CreativeKitSchema,
      research: z.array(ResearchAngleSchema).max(10).default([]),
    })
    .optional(),
  contents: z.array(GeneratedContentSchema).min(1).max(12),
});
export type GenerationComplete = z.infer<typeof GenerationCompleteSchema>;

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------
export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const ScheduleSchema = z.object({
  timezone: z.string().min(1).default("Asia/Jakarta"),
  days: z.array(z.enum(WEEKDAYS)).min(1, "Pick at least one publishing day"),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
});
export type Schedule = z.infer<typeof ScheduleSchema>;

export type Selection = Partial<Record<OptionField, number>>;
