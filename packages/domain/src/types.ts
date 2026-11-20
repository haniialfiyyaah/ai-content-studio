import { z } from "zod";

// ---------------------------------------------------------------------------
// Status vocabularies (mirror DB CHECK constraints)
// ---------------------------------------------------------------------------
export const PROJECT_STATUSES = ["generating", "draft", "active", "paused", "stopped", "failed"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type RunStatus = "queued" | "running" | "succeeded" | "failed";
export type RunKind = "project_setup" | "ideation" | "research" | "revision";
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

/** Beat layouts — see .claude/skills/content-video/SKILL.md §4. */
export const BEAT_LAYOUTS = ["hook", "statement", "points", "code", "compare", "stat", "quote", "product", "image", "cta"] as const;
export const CONTENT_FORMATS = ["explainer", "listicle", "story", "compare", "product"] as const;
export const BEAT_TRANSITIONS = ["cut", "slide", "zoom", "flash", "wipe"] as const;

/** A scene is one "beat" of the video (≈ 2–5 s). Layout fields are optional so older content still renders. */
export const SceneSchema = z.object({
  heading: nonEmpty,
  narration: z.string().default(""),
  visual: z.string().default(""),
  onScreenText: z.string().default(""),
  motion: z.string().default(""),
  seconds: z.coerce.number().min(1).max(60).default(5),
  /** Index into the project's reference uploads to use for this scene; -1 = none. */
  referenceIndex: z.coerce.number().int().min(-1).max(50).default(-1),
  layout: z.enum(BEAT_LAYOUTS).catch("image").default("image"),
  headline: z.string().max(80).default(""),
  points: z.array(z.string().max(80)).max(5).default([]),
  code: z.string().max(600).default(""),
  left: z.string().max(120).default(""),
  right: z.string().max(120).default(""),
  stat: z.string().max(16).default(""),
  statLabel: z.string().max(80).default(""),
  emphasis: z.array(z.string().max(30)).max(6).default([]),
  transition: z.enum(BEAT_TRANSITIONS).catch("cut").default("cut"),
  /** ai = generated illustration; design = code-drawn branded background (no image cost). */
  background: z.enum(["ai", "design"]).catch("ai").default("ai"),
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
  format: z.enum(CONTENT_FORMATS).catch("explainer").default("explainer"),
  options: ContentOptionsSchema,
  scenes: z.array(SceneSchema).min(1).max(10),
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
  /** Visual identity (content-video skill §5). */
  palette: z.string().default(""),
  recurringSubject: z.string().default(""),
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

export const IMAGE_ENGINES = ["openai", "fal"] as const;
export type ImageEngine = (typeof IMAGE_ENGINES)[number];
export const IMAGE_ENGINE_LABELS: Record<ImageEngine, { label: string; help: string }> = {
  openai: { label: "OpenAI (GPT Image)", help: "Best at following the scene description and keeping your character consistent. fal is the backup." },
  fal: { label: "fal (Flux)", help: "Fast, painterly Flux images; uses your fal credit. OpenAI is the backup if fal fails or runs out." },
};

export const VISUAL_MODES = ["ai", "ai_with_references", "references"] as const;
export type VisualMode = (typeof VISUAL_MODES)[number];
export const VISUAL_MODE_LABELS: Record<VisualMode, string> = {
  ai: "AI generate",
  ai_with_references: "AI + my references",
  references: "Use my images",
};

// ---------------------------------------------------------------------------
// Ending: how every Short ends (call to action, handle, series teaser).
// ---------------------------------------------------------------------------
export const CTA_TYPES = ["follow", "subscribe", "comment", "save", "link", "visit"] as const;
export type CtaType = (typeof CTA_TYPES)[number];
export const CTA_LABELS: Record<CtaType, { label: string; button: string; example: string }> = {
  follow: { label: "Follow for more", button: "FOLLOW", example: "Follow — part 2 drops tomorrow" },
  subscribe: { label: "Subscribe", button: "SUBSCRIBE", example: "Subscribe so you don't miss the next one" },
  comment: { label: "Comment", button: "COMMENT", example: "Comment your city and I'll rate it" },
  save: { label: "Save this", button: "SAVE", example: "Save this for your next exam" },
  link: { label: "Link in bio", button: "LINK IN BIO", example: "Full recipe — link in bio" },
  visit: { label: "Visit website", button: "VISIT", example: "Get it at shop.example.com" },
};

export const EndingSchema = z.object({
  /** Channel name or @handle shown on the end screen and used in the CTA. */
  handle: z.string().trim().max(40).default(""),
  cta: z.enum(CTA_TYPES).default("follow"),
  /** Optional exact call to action the creator wants (overrides the default style). */
  ctaText: z.string().trim().max(120).default(""),
  /** Website for "visit" (shown on the end screen). */
  link: z.string().trim().max(120).default(""),
  /** Each video teases the next one in the project. */
  series: z.boolean().default(true),
});
export type Ending = z.infer<typeof EndingSchema>;

export function parseEnding(raw: unknown): Ending {
  const r = EndingSchema.safeParse(raw ?? {});
  return r.success ? r.data : EndingSchema.parse({});
}

/** Instructions for the writer/editor so every script ends the creator's way. */
export function endingBrief(raw: unknown, fallbackHandle = ""): string {
  const e = parseEnding(raw);
  const handle = e.handle || fallbackHandle;
  const lines = [
    "ENDING (the creator's settings — the last beat must follow them):",
    `- Call to action: ${CTA_LABELS[e.cta].label}${e.ctaText ? ` — say it like: "${e.ctaText}"` : ` (e.g. "${CTA_LABELS[e.cta].example}")`}.`,
    handle ? `- Mention the channel naturally as ${handle} in the CTA narration or headline.` : "",
    e.cta === "visit" && e.link ? `- The website is ${e.link}; say it simply.` : "",
    e.series
      ? "- SERIES: each item's CTA teases the NEXT item in this batch by its concrete topic (item 1 teases item 2, …; the last item teases a natural next episode not in this batch), e.g. \"Next: the 3-ingredient sauce — follow so you don't miss it\". The cta beat headline should be the teaser (<= 5 words)."
      : "- The cta beat headline is the call to action itself (<= 5 words).",
  ];
  return lines.filter(Boolean).join("\n");
}
