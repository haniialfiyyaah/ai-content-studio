import type {
  ContentOptions,
  ContentStatus,
  Concept,
  CreativeKit,
  MessageMeta,
  SetupStage,
  ProjectStatus,
  PublishStatus,
  RenderStatus,
  RunKind,
  RunStatus,
  Scene,
  Schedule,
  Selection,
} from "@acs/domain";

/** projects (v2 baseline). Use projectKit(p) from @acs/domain for the merged Creative Kit. */
export interface ProjectRow {
  id: string;
  owner_id: string;
  status: ProjectStatus;
  idea: string;
  title: string;
  summary: string | null;
  emoji: string | null;
  cover_tone: number;
  setup_stage: SetupStage;
  setup_busy: boolean;
  setup_started_at: string | null;
  setup_retries: number;
  setup_similar: unknown;
  concept: Partial<Concept>;
  kit: Partial<CreativeKit>;
  ending: unknown;
  schedule: Partial<Schedule>;
  auto_approve: boolean;
  content_stage: "none" | "plan" | "storyboard" | "production";
  content_plan: Record<string, unknown>;
  visual_mode: "ai" | "ai_with_references" | "references";
  image_engine: "openai" | "fal";
  voice_id: string | null;
  voice_name: string | null;
  live_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RunRow {
  id: string;
  owner_id: string;
  project_id: string;
  kind: RunKind;
  status: RunStatus;
  stage: string;
  progress: number;
  content_count: number;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentRow {
  id: string;
  owner_id: string;
  project_id: string;
  position: number;
  status: ContentStatus;
  label?: string | null;
  script_status?: "none" | "writing" | "ready" | "failed";
  on_hold?: boolean;
  storyboard_status?: string | null;
  options: Partial<ContentOptions>;
  selection: Selection;
  scenes: Scene[];
  video_prompt: string | null;
  scheduled_for: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface RenderStep {
  scene: number;
  source?: "reference" | "fal" | "none";
  status: "queued" | "in_progress" | "completed" | "failed";
  url: string | null;
}

export interface RenderRow {
  id: string;
  owner_id: string;
  project_id: string;
  content_id: string;
  status: RenderStatus;
  phase: "assets" | "compose" | "done";
  steps: RenderStep[];
  prompt: string | null;
  narration_path: string | null;
  provider: string;
  storage_path: string | null;
  attempts: number;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublishJobRow {
  id: string;
  owner_id: string;
  project_id: string;
  content_id: string;
  render_id: string | null;
  platform: "youtube";
  scheduled_for: string;
  status: PublishStatus;
  external_id: string | null;
  external_url: string | null;
  attempts: number;
  error: string | null;
  published_at: string | null;
}

export interface ActivityRow {
  id: string;
  project_id: string | null;
  kind: string;
  message: string;
  created_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  meta?: MessageMeta | null;
  created_at: string;
}
