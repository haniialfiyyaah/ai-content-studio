-- AI Content Studio — v2.7 schema (fresh start, 2026-11-20)
--
-- Flow: prompt → project (generating) → contents with AI option sets →
-- approve all → schedule → activate → video_renders (queued) → publish_jobs.
--
-- Next.js is the domain authority: users write through RLS-scoped API routes,
-- n8n writes only through /api/internal/* with the service role.
-- Realtime is enabled on the tables the UI watches (no reloads).

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- profiles (1:1 auth.users)
-- ---------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  timezone text NOT NULL DEFAULT 'Asia/Jakarta',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data ->> 'display_name',
      NEW.raw_user_meta_data ->> 'full_name',
      split_part(COALESCE(NEW.email, ''), '@', 1)
    ),
    NEW.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New project',
  summary text,
  prompt text NOT NULL,
  status text NOT NULL DEFAULT 'generating'
    CHECK (status IN ('generating', 'draft', 'active', 'paused', 'stopped', 'failed')),
  cover_tone smallint NOT NULL DEFAULT 0 CHECK (cover_tone BETWEEN 0 AND 3),
  cover_emoji text,
  -- { tone, audience, language, visualStyle, voice, pillars[], guardrails[] }
  creative_kit jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- { timezone, days: ["mon",…], time: "HH:MM", startDate: "YYYY-MM-DD" }
  schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
  ideation_enabled boolean NOT NULL DEFAULT false,
  ideation_every_days int NOT NULL DEFAULT 7 CHECK (ideation_every_days BETWEEN 1 AND 60),
  next_ideation_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_owner_idx ON public.projects (owner_id, updated_at DESC);
CREATE INDEX projects_ideation_due_idx ON public.projects (next_ideation_at)
  WHERE status = 'active' AND ideation_enabled;

-- ---------------------------------------------------------------------------
-- conversations + messages (one new conversation per project, as prototype)
-- ---------------------------------------------------------------------------
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects (id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'web' CHECK (channel IN ('web', 'telegram')),
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conversations_project_idx ON public.conversations (project_id);
CREATE INDEX conversations_owner_idx ON public.conversations (owner_id, updated_at DESC);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_idx ON public.messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- generation runs (drives the "Preparing your project" screen)
-- ---------------------------------------------------------------------------
CREATE TABLE public.generation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'project_setup'
    CHECK (kind IN ('project_setup', 'ideation', 'research')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  stage text NOT NULL DEFAULT 'queued',
  progress smallint NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  content_count smallint NOT NULL DEFAULT 4 CHECK (content_count BETWEEN 1 AND 12),
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX generation_runs_project_idx ON public.generation_runs (project_id, created_at DESC);
CREATE INDEX generation_runs_stale_idx ON public.generation_runs (updated_at) WHERE status = 'queued';

-- ---------------------------------------------------------------------------
-- contents: AI produces several options per field; the user picks, never types
-- options   = { title: [..], hook: [..], script: [..], caption: [..], hashtags: [..] }
-- selection = { title: 0, hook: 2, … }  (index into options)
-- scenes    = [{ heading, narration, visual, onScreenText, motion, seconds }]
-- ---------------------------------------------------------------------------
CREATE TABLE public.contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.generation_runs (id) ON DELETE SET NULL,
  position int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'archived')),
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  selection jsonb NOT NULL DEFAULT '{}'::jsonb,
  scenes jsonb NOT NULL DEFAULT '[]'::jsonb,
  video_prompt text,
  scheduled_for timestamptz,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contents_project_idx ON public.contents (project_id, position);

-- ---------------------------------------------------------------------------
-- video renders (queue: WF-02 + WF-02S sweeper)
-- ---------------------------------------------------------------------------
CREATE TABLE public.video_renders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  content_id uuid NOT NULL REFERENCES public.contents (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'rendering', 'ready', 'failed', 'cancelled')),
  provider text NOT NULL DEFAULT 'fal',
  model text,
  prompt text,
  provider_request_id text,
  storage_path text,
  duration_seconds numeric(8, 2),
  attempts smallint NOT NULL DEFAULT 0,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX video_renders_content_idx ON public.video_renders (content_id, created_at DESC);
CREATE INDEX video_renders_queue_idx ON public.video_renders (updated_at) WHERE status = 'queued';

-- ---------------------------------------------------------------------------
-- publishing
-- ---------------------------------------------------------------------------
CREATE TABLE public.connected_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('youtube')),
  external_account_id text,
  display_name text,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'error', 'revoked')),
  scopes text[] NOT NULL DEFAULT '{}',
  connected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, platform)
);

-- Service-role only (RLS on, no policies). Tokens are AES-GCM encrypted by the app.
CREATE TABLE public.oauth_tokens (
  account_id uuid PRIMARY KEY REFERENCES public.connected_accounts (id) ON DELETE CASCADE,
  access_token_enc text,
  refresh_token_enc text NOT NULL,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.publish_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  content_id uuid NOT NULL REFERENCES public.contents (id) ON DELETE CASCADE,
  render_id uuid REFERENCES public.video_renders (id) ON DELETE SET NULL,
  platform text NOT NULL DEFAULT 'youtube' CHECK (platform IN ('youtube')),
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  external_id text,
  external_url text,
  attempts smallint NOT NULL DEFAULT 0,
  error text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_id, platform)
);
CREATE INDEX publish_jobs_due_idx ON public.publish_jobs (scheduled_for) WHERE status = 'scheduled';
CREATE INDEX publish_jobs_owner_idx ON public.publish_jobs (owner_id, scheduled_for);

CREATE TABLE public.analytics_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  publish_job_id uuid NOT NULL REFERENCES public.publish_jobs (id) ON DELETE CASCADE,
  views bigint NOT NULL DEFAULT 0,
  likes bigint NOT NULL DEFAULT 0,
  comments bigint NOT NULL DEFAULT 0,
  captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analytics_job_idx ON public.analytics_snapshots (publish_job_id, captured_at DESC);

CREATE TABLE public.research_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  source text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX research_notes_project_idx ON public.research_notes (project_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- activity, notifications, telegram, workflow errors
-- ---------------------------------------------------------------------------
CREATE TABLE public.activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects (id) ON DELETE CASCADE,
  kind text NOT NULL,
  message text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_owner_idx ON public.activity_events (owner_id, created_at DESC);
CREATE INDEX activity_project_idx ON public.activity_events (project_id, created_at DESC);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects (id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'telegram' CHECK (channel IN ('telegram', 'in_app')),
  template text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivery_state text NOT NULL DEFAULT 'pending'
    CHECK (delivery_state IN ('pending', 'sending', 'delivered', 'failed', 'cancelled')),
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_pending_idx ON public.notifications (created_at) WHERE delivery_state = 'pending';

CREATE TABLE public.telegram_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  telegram_user_id bigint NOT NULL,
  telegram_chat_id bigint,
  notifications_enabled boolean NOT NULL DEFAULT true,
  linked_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX telegram_links_active_user_uidx ON public.telegram_links (telegram_user_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX telegram_links_active_owner_uidx ON public.telegram_links (owner_id) WHERE revoked_at IS NULL;

-- Service-role only (RLS on, no policies).
CREATE TABLE public.workflow_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow text NOT NULL,
  execution_id text,
  node text,
  message text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles', 'projects', 'conversations', 'generation_runs', 'contents',
    'video_renders', 'connected_accounts', 'oauth_tokens', 'publish_jobs', 'telegram_links'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %1$s_set_updated_at BEFORE UPDATE ON public.%1$s
         FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- RLS: every user-facing table is owner-scoped. Writes that must be trusted
-- (generation output, render/publish state) happen via the service role.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_own ON public.profiles FOR ALL TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'projects', 'conversations', 'messages', 'contents', 'telegram_links'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%1$s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %1$s_own ON public.%1$s FOR ALL TO authenticated
         USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid())', t);
  END LOOP;

  -- read-only for users
  FOREACH t IN ARRAY ARRAY[
    'generation_runs', 'video_renders', 'connected_accounts', 'publish_jobs',
    'analytics_snapshots', 'research_notes', 'activity_events', 'notifications'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%1$s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %1$s_read_own ON public.%1$s FOR SELECT TO authenticated
         USING (owner_id = auth.uid())', t);
  END LOOP;
END $$;

ALTER TABLE public.oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_errors ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Realtime: the UI subscribes to these (owner RLS applies to change feeds)
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  FOREACH t IN ARRAY ARRAY[
    'projects', 'generation_runs', 'contents', 'video_renders', 'publish_jobs',
    'activity_events', 'messages'
  ] LOOP
    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- storage: private renders bucket, objects under "<owner_id>/…"
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('renders', 'renders', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS storage_renders_select_own ON storage.objects;
CREATE POLICY storage_renders_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'renders' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- multi-scene render state: one fal clip per scene → fal compose (+ narration)
-- steps = [{ scene: 0, requestId, status, url }]
-- ---------------------------------------------------------------------------
ALTER TABLE public.video_renders
  ADD COLUMN phase text NOT NULL DEFAULT 'scenes' CHECK (phase IN ('scenes', 'compose', 'done')),
  ADD COLUMN steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN compose_request_id text,
  ADD COLUMN narration_path text;

-- ---------------------------------------------------------------------------
-- references + Remotion renderer (2026-11-20, second pass)
-- ---------------------------------------------------------------------------
ALTER TABLE public.projects
  ADD COLUMN visual_mode text NOT NULL DEFAULT 'ai'
    CHECK (visual_mode IN ('ai', 'ai_with_references', 'references'));

CREATE TABLE public.project_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  label text NOT NULL DEFAULT '',
  mime_type text NOT NULL DEFAULT 'image/jpeg',
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_assets_project_idx ON public.project_assets (project_id, created_at);
ALTER TABLE public.project_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_assets_read_own ON public.project_assets FOR SELECT TO authenticated USING (owner_id = auth.uid());
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_assets;

-- phases: assets (scene images + narration) → compose (Remotion renderer) → done
ALTER TABLE public.video_renders DROP CONSTRAINT IF EXISTS video_renders_phase_check;
ALTER TABLE public.video_renders ALTER COLUMN phase SET DEFAULT 'assets';
ALTER TABLE public.video_renders ADD CONSTRAINT video_renders_phase_check CHECK (phase IN ('assets', 'compose', 'done'));
-- word timings for burned-in captions: [{ text, start, end }] (seconds)
ALTER TABLE public.video_renders ADD COLUMN captions jsonb NOT NULL DEFAULT '[]'::jsonb;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('assets', 'assets', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
CREATE POLICY storage_assets_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'assets' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Telegram flow + AI revisions (2026-11-20, third pass)
-- ---------------------------------------------------------------------------
-- Telegram conversation state: { currentProjectId, awaiting: 'revise' | null }
ALTER TABLE public.telegram_links ADD COLUMN state jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.generation_runs DROP CONSTRAINT IF EXISTS generation_runs_kind_check;
ALTER TABLE public.generation_runs ADD CONSTRAINT generation_runs_kind_check
  CHECK (kind IN ('project_setup', 'ideation', 'research', 'revision'));
ALTER TABLE public.generation_runs
  ADD COLUMN feedback text,
  ADD COLUMN target_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN channel text NOT NULL DEFAULT 'web' CHECK (channel IN ('web', 'telegram'));
