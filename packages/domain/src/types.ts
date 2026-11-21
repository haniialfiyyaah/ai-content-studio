import { z } from "zod";

// ---------------------------------------------------------------------------
// Status vocabularies (mirror DB CHECK constraints)
// ---------------------------------------------------------------------------
/** setup → draft → live (schedule running) → paused / stopped. "Generating" / "failed" are run signals, not states. */
export const PROJECT_STATUSES = ["setup", "draft", "live", "paused", "stopped", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type RunStatus = "queued" | "running" | "succeeded" | "failed";
export type RunKind = "ideation" | "revision" | "storyboard";
/** idea → approved; removed = gone for the creator, remembered so it is never suggested again. */
/** skipped = set aside by the creator (kept, restorable, never rendered). */
export type ContentStatus = "idea" | "approved" | "skipped" | "removed";
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
  /** What the project mascot does in this beat (Mascot / Mixed visuals). */
  mascotPose: z.string().max(20).catch("").default(""),
  mascotExpression: z.string().max(20).catch("").default(""),
  mascotProp: z.string().max(8).catch("").default(""),
  mascotSetting: z.string().max(20).catch("").default(""),
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
  scenes: z.array(SceneSchema).min(1).max(12),
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
  /** v2 setup: default content format and how videos open. */
  format: z.string().default(""),
  opening: z.string().default(""),
  /** v2 setup: from the Concept stage. */
  niche: z.string().default(""),
  goal: z.string().default(""),
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

/** Where scene visuals come from: AI illustrations · Mixed (AI for hook / payoff / ending, mascot elsewhere) · Mascot (code-drawn, free). */
export const VISUAL_SOURCES = ["ai", "mixed", "mascot"] as const;
export type VisualSource = (typeof VISUAL_SOURCES)[number];
export const VISUAL_SOURCE_LABELS: Record<VisualSource, { label: string; help: string }> = {
  ai: { label: "AI illustrations", help: "Every scene is a custom AI image — best looking, uses image credits." },
  mixed: { label: "Mixed", help: "AI images for the hook, payoff and ending; your mascot in the other scenes." },
  mascot: { label: "Mascot", help: "Your project mascot, drawn by code in every scene — free." },
};

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

// ---------------------------------------------------------------------------
// Guided setup (docs/FLOW.md) — Discovery → Concept → Creative Kit → Pillars
// ---------------------------------------------------------------------------
export const SETUP_STAGES = ["similar", "concept", "kit", "pillars", "character", "done"] as const;
export type SetupStage = (typeof SETUP_STAGES)[number];
export const SETUP_STAGE_LABELS: Record<SetupStage, string> = {
  similar: "Your idea",
  concept: "Concept",
  kit: "Creative Kit",
  pillars: "Pillars & guardrails",
  character: "Character & references",
  done: "Ready",
};
/** The stage after this one (pillars → done). */
export function nextSetupStage(s: SetupStage): SetupStage {
  return SETUP_STAGES[Math.min(SETUP_STAGES.indexOf(s) + 1, SETUP_STAGES.length - 1)];
}

/** What the content is about and for whom (the "what"); the kit is the "how". */
/** Model output is trimmed to fit instead of rejected (a long field must never block a step). */
const clip = (max: number, fallback = "") => z.string().default(fallback).transform((v) => v.trim().slice(0, max));

export const ConceptSchema = z.object({
  title: clip(80),
  emoji: clip(8, ""),
  summary: clip(400, ""),
  niche: clip(200, ""),
  audience: clip(300, ""),
  goal: clip(300, ""),
  language: clip(160, "English"),
});
export type Concept = z.infer<typeof ConceptSchema>;

export const SetupKitSchema = z.object({
  tone: clip(300, ""),
  voice: clip(800, ""),
  visualStyle: clip(500, ""),
  palette: clip(200, ""),
  recurringSubject: clip(400, ""),
  format: clip(200, ""),
  opening: clip(300, ""),
  ending: z.object({ cta: z.enum(CTA_TYPES).catch("follow"), series: z.coerce.boolean().default(true) }).partial().default({}),
});
export type SetupKit = z.infer<typeof SetupKitSchema>;

export const SetupPillarsSchema = z.object({
  pillars: z.array(clip(200)).min(1).transform((v) => v.filter(Boolean).slice(0, 6)),
  guardrails: z.array(clip(200)).min(1).transform((v) => v.filter(Boolean).slice(0, 6)),
});
export type SetupPillars = z.infer<typeof SetupPillarsSchema>;

export const SETUP_TASKS = ["chat", "concept", "kit", "pillars", "character", "plan", "scene", "renumber", "more"] as const;
export type SetupTask = (typeof SETUP_TASKS)[number];

/** n8n WF-05 → /api/internal/setup/complete */
export const SetupCompleteSchema = z.object({
  projectId: z.string().uuid(),
  task: z.enum(SETUP_TASKS),
  /** Short message to the creator (chat answer, or the intro line for a stage result). */
  reply: clip(3000),
  /** chat only: what the server should do next. */
  action: z
    .object({
      type: z.enum(["ask", "propose", "refine", "continue", "similar", "add"]).catch("ask"),
      /** add: how many new contents (1-5). */
      count: z.coerce.number().int().min(1).max(5).catch(1),
      feedback: z.string().max(1500).default(""),
      projectId: z.string().default(""),
      chips: z.array(z.string().max(80)).max(4).default([]),
    })
    .partial()
    .default({}),
  concept: ConceptSchema.optional(),
  kit: SetupKitSchema.optional(),
  pillars: SetupPillarsSchema.optional(),
  plan: z.lazy(() => ContentPlanSchema).optional(),
  /** task "scene": the rewritten scene (merged into the existing one). */
  scene: z
    .object({
      heading: clip(120),
      narration: clip(600),
      visual: clip(600),
      onScreenText: clip(120),
      headline: clip(80),
      seconds: z.coerce.number().min(1).max(15).catch(4),
    })
    .partial()
    .optional(),
  /** task "character": the project character, concrete enough to draw, + the code-drawn mascot version. */
  character: z
    .object({
      description: clip(600),
      mascot: z
        .object({ shape: clip(20), color: clip(20), accent: clip(20), accessory: clip(20) })
        .partial()
        .default({}),
    })
    .optional(),
  /** task "renumber": text-only fixes after a skip / restore in a daily or connected series. */
  patches: z
    .array(
      z.object({
        contentId: z.string(),
        title: clip(120).optional(),
        hook: clip(200).optional(),
        description: clip(1000).optional(),
        scenes: z
          .array(z.object({ index: z.coerce.number().int().min(0), narration: clip(600).optional(), onScreenText: clip(120).optional(), headline: clip(80).optional() }))
          .default([]),
      }),
    )
    .optional(),
  /** echoed back: which content / scene a "scene" task was for */
  target: z.object({ contentId: z.string().uuid(), scene: z.coerce.number().int().min(0) }).optional(),
});
export type SetupComplete = z.infer<typeof SetupCompleteSchema>;

/** Extra data on a chat message (quick replies, stage result, similar project). */
export interface MessageMeta {
  chips?: string[];
  stage?: SetupStage;
  similar?: { projectId: string; title: string };
  /** Snapshot of the stage result this message presented (cards keep their version). */
  data?: Record<string, unknown>;
}

/**
 * The full Creative Kit downstream steps read (scripts, images, voice): the
 * project's kit ("how") merged with its concept ("what & for whom").
 */
export function projectKit(p: { kit?: Partial<CreativeKit> | null; concept?: Partial<Concept> | null }): Partial<CreativeKit> {
  const k = p.kit ?? {};
  const c = p.concept ?? {};
  return {
    ...k,
    niche: c.niche ?? k.niche ?? "",
    goal: c.goal ?? k.goal ?? "",
    audience: c.audience ?? k.audience ?? "",
    language: c.language || k.language || "English",
  };
}

// ---------------------------------------------------------------------------
// User API payloads
// ---------------------------------------------------------------------------
/** PATCH /api/projects/:id/settings — any subset. `schedule` is validated by ScheduleSchema. */
export const ProjectSettingsSchema = z
  .object({
    schedule: z.unknown(),
    ending: EndingSchema,
    imageEngine: z.enum(IMAGE_ENGINES),
    visualMode: z.enum(VISUAL_MODES),
    autoApprove: z.boolean(),
    /** Create the videos automatically once every storyboard is done. */
    autoVideo: z.boolean(),
    visualSource: z.enum(VISUAL_SOURCES),
  })
  .partial();
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;

/** POST /api/contents/:id/actions */
export const CONTENT_ACTIONS = ["approve", "remove", "skip", "restore", "hold", "resume", "unlock", "storyboard", "draw_missing", "render", "make_video", "publish"] as const;
export type ContentAction = (typeof CONTENT_ACTIONS)[number];

// ---------------------------------------------------------------------------
// Content setup (phase 2) — after the project setup is locked
// ---------------------------------------------------------------------------
/** none → plan (content concepts) → storyboard (scenes + script + sketches) → production (images, video, publish) */
export const CONTENT_STAGES = ["none", "plan", "storyboard", "production"] as const;
export type ContentStage = (typeof CONTENT_STAGES)[number];

export const PlanItemSchema = z.object({
  /** "Day 1" / "Episode 2" for a series, empty for a single video. */
  label: clip(40),
  title: clip(120),
  hook: clip(200),
  description: clip(1000),
  hashtags: z.array(clip(40)).default([]).transform((v) => v.filter(Boolean).slice(0, 10)),
});
export type PlanItem = z.infer<typeof PlanItemSchema>;

export const ContentPlanSchema = z.object({
  format: z.enum(["single", "series"]).catch("single"),
  /** daily = Day 1, Day 2… · episodic = connected episodes · standalone = related but separate */
  style: z.enum(["daily", "episodic", "standalone"]).catch("standalone"),
  seriesTitle: clip(120),
  /** One line: why single / series and why this style. */
  why: clip(400),
  items: z.array(PlanItemSchema).min(1).transform((v) => v.filter((i) => i.title).slice(0, 14)),
});
export type ContentPlan = z.infer<typeof ContentPlanSchema>;
export type ContentPlanMeta = Omit<ContentPlan, "items"> & { count?: number };
