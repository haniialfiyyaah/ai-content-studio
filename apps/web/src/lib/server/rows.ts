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

export interface ProjectRow {
  id: string;
  owner_id: string;
  title: string;
  summary: string | null;
  prompt: string;
  status: ProjectStatus;
  cover_tone: number;
  cover_emoji: string | null;
  creative_kit: Partial<CreativeKit>;
  schedule: Partial<Schedule>;
  ideation_enabled: boolean;
  visual_mode: "ai" | "ai_with_references" | "references";
  image_engine?: "openai" | "fal";
  ending?: unknown;
  auto_approve?: boolean;
  setup_stage?: SetupStage;
  setup_busy?: boolean;
  setup_started_at?: string | null;
  concept?: Partial<Concept>;
  ideation_every_days: number;
  next_ideation_at: string | null;
  activated_at: string | null;
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
  compose_request_id: string | null;
  narration_path: string | null;
  provider: string;
  model: string | null;
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
