-- AI Content Studio — v2 baseline (2026-11-21). Replaces the v2.7 schema and its
-- patches (kept in supabase/archive/). Matches docs/FLOW.md:
--
--   idea → [similar check] → concept → kit → pillars (project status "setup")
--   → content ideas (status "idea") → approve & schedule → storyboard images
--   → video_renders → publish_jobs (project status "live").
--
-- Next.js is the domain authority: users write through RLS-scoped API routes,
-- n8n writes only through /api/internal/* with the service role. Realtime is on
-- for the tables the UI watches.
--
-- Safe on a fresh database and on the v2.7 one: account tables (profiles,
-- connected_accounts, oauth_tokens, telegram_links) are created only when
-- missing; every project-domain table is dropped and recreated (it was empty).

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
-- accounts (kept across rebuilds)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
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
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', NEW.raw_user_meta_data ->> 'full_name', split_part(COALESCE(NEW.email, ''), '@', 1)),
    NEW.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE IF NOT EXISTS public.connected_accounts (
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
CREATE TABLE IF NOT EXISTS public.oauth_tokens (
  account_id uuid PRIMARY KEY REFERENCES public.connected_accounts (id) ON DELETE CASCADE,
  access_token_enc text,
  refresh_token_enc text NOT NULL,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- state: { currentProjectId, awaiting: 'revise' | null }
CREATE TABLE IF NOT EXISTS public.telegram_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  telegram_user_id bigint NOT NULL,
  telegram_chat_id bigint,
  notifications_enabled boolean NOT NULL DEFAULT true,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  linked_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS telegram_links_active_user_uidx ON public.telegram_links (telegram_user_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS telegram_links_active_owner_uidx ON public.telegram_links (owner_id) WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- project domain (rebuilt)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.analytics_snapshots, public.publish_jobs, public.video_renders, public.contents,
  public.generation_runs, public.messages, public.conversations, public.notifications, public.activity_events,
  public.project_assets, public.research_notes, public.workflow_errors, public.projects CASCADE;

-- A project is saved once the agent made its concept (setup drafts without one
-- are hidden and cleaned up). Generating / failed are signals from
-- generation_runs, not project states.
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'draft', 'live', 'paused', 'stopped')),
  -- the creator's own words
  idea text NOT NULL,
  title text NOT NULL DEFAULT 'New project',
  summary text,
  emoji text,
  cover_tone smallint NOT NULL DEFAULT 0 CHECK (cover_tone BETWEEN 0 AND 3),

  -- guided setup: similar check → concept → kit → pillars → done
  setup_stage text NOT NULL DEFAULT 'similar' CHECK (setup_stage IN ('similar', 'concept', 'kit', 'pillars', 'done')),
  setup_busy boolean NOT NULL DEFAULT false,
  setup_started_at timestamptz,
  setup_retries smallint NOT NULL DEFAULT 0,
  -- [{ id, title, status, score }] from the similar check
  setup_similar jsonb,

  -- what & for whom: { title, emoji, summary, niche, audience, goal, language }
  concept jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- how it looks & sounds: { tone, voice, visualStyle, palette, recurringSubject,
  --   format, opening, pillars[], guardrails[] }
  kit jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- { handle, cta, ctaText, link, series }
  ending jsonb NOT NULL DEFAULT '{"cta": "follow", "series": true}'::jsonb,
  -- { timezone, days: ["mon",…], time: "HH:MM", startDate: "YYYY-MM-DD" }
  schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
  auto_approve boolean NOT NULL DEFAULT false,

  visual_mode text NOT NULL DEFAULT 'ai' CHECK (visual_mode IN ('ai', 'ai_with_references', 'references')),
  image_engine text NOT NULL DEFAULT 'openai' CHECK (image_engine IN ('openai', 'fal')),
  voice_id text,
  voice_name text,

  live_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_owner_idx ON public.projects (owner_id, updated_at DESC);

-- one web conversation per project (+ telegram ones); meta = { chips[], stage, similar, data }
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
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_idx ON public.messages (conversation_id, created_at);

-- content generation (WF-01): ideation = new ideas (feedback = the creator's brief),
-- revision = rewrite target_ids from feedback
CREATE TABLE public.generation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'ideation' CHECK (kind IN ('ideation', 'revision')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  stage text NOT NULL DEFAULT 'queued',
  progress smallint NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  content_count smallint NOT NULL DEFAULT 3 CHECK (content_count BETWEEN 1 AND 12),
  feedback text,
  target_ids uuid[] NOT NULL DEFAULT '{}',
  channel text NOT NULL DEFAULT 'web' CHECK (channel IN ('web', 'telegram')),
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX generation_runs_project_idx ON public.generation_runs (project_id, created_at DESC);
CREATE INDEX generation_runs_stale_idx ON public.generation_runs (updated_at) WHERE status = 'queued';

-- One content = one Short. idea → approved; removed = gone for the creator but
-- remembered so it is never suggested again. on_hold = has media, never
-- published until resumed.
--   options   = { title: [..], hook: [..], script: [..], caption: [..], hashtags: [..] }
--   selection = { title: 0, hook: 2, … }
--   scenes    = [{ heading, narration, visual, layout, … }]  (SceneSchema)
--   storyboard = [{ scene, source, imagePath, … }]  (drawn on approve)
CREATE TABLE public.contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.generation_runs (id) ON DELETE SET NULL,
  position int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'idea' CHECK (status IN ('idea', 'approved', 'removed')),
  on_hold boolean NOT NULL DEFAULT false,
  format text NOT NULL DEFAULT 'explainer' CHECK (format IN ('explainer', 'listicle', 'story', 'compare', 'product')),
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  selection jsonb NOT NULL DEFAULT '{}'::jsonb,
  scenes jsonb NOT NULL DEFAULT '[]'::jsonb,
  video_prompt text,
  storyboard jsonb,
  storyboard_status text NOT NULL DEFAULT 'none' CHECK (storyboard_status IN ('none', 'generating', 'ready', 'failed')),
  storyboard_key text,
  storyboard_started_at timestamptz,
  scheduled_for timestamptz,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contents_project_idx ON public.contents (project_id, position);

-- video renders: assets (scene images + narration) → compose (Remotion) → done
CREATE TABLE public.video_renders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  content_id uuid NOT NULL REFERENCES public.contents (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'rendering', 'ready', 'failed', 'cancelled')),
  phase text NOT NULL DEFAULT 'assets' CHECK (phase IN ('assets', 'compose', 'done')),
  provider text NOT NULL DEFAULT 'remotion',
  prompt text,
  -- [{ scene, source, imagePath, … }]
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- word timings for burned-in captions: [{ text, start, end }] (seconds)
  captions jsonb NOT NULL DEFAULT '[]'::jsonb,
  narration_path text,
  storage_path text,
  duration_seconds numeric(8, 2),
  attempts smallint NOT NULL DEFAULT 0,
  error text,
  download_count int NOT NULL DEFAULT 0,
  last_downloaded_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX video_renders_content_idx ON public.video_renders (content_id, created_at DESC);
CREATE INDEX video_renders_queue_idx ON public.video_renders (updated_at) WHERE status = 'queued';

CREATE TABLE public.publish_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  content_id uuid NOT NULL REFERENCES public.contents (id) ON DELETE CASCADE,
  render_id uuid REFERENCES public.video_renders (id) ON DELETE SET NULL,
  platform text NOT NULL DEFAULT 'youtube' CHECK (platform IN ('youtube')),
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'publishing', 'published', 'failed', 'cancelled')),
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
CREATE INDEX publish_jobs_project_idx ON public.publish_jobs (project_id, scheduled_for);

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

-- reference images, the generated character (label "identity"), uploads
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
  delivery_state text NOT NULL DEFAULT 'pending' CHECK (delivery_state IN ('pending', 'sending', 'delivered', 'failed', 'cancelled')),
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_pending_idx ON public.notifications (created_at) WHERE delivery_state = 'pending';

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
  FOREACH t IN ARRAY ARRAY['profiles', 'connected_accounts', 'oauth_tokens', 'telegram_links',
    'projects', 'conversations', 'generation_runs', 'contents', 'video_renders', 'publish_jobs'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_set_updated_at ON public.%1$s', t);
    EXECUTE format('CREATE TRIGGER %1$s_set_updated_at BEFORE UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- RLS: owner-scoped. Trusted writes (generation output, render/publish state)
-- go through the service role.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profiles_own ON public.profiles;
CREATE POLICY profiles_own ON public.profiles FOR ALL TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['projects', 'conversations', 'messages', 'contents', 'telegram_links'] LOOP
    EXECUTE format('ALTER TABLE public.%1$s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_own ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_own ON public.%1$s FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid())', t);
  END LOOP;
  -- read-only for users
  FOREACH t IN ARRAY ARRAY['generation_runs', 'video_renders', 'connected_accounts', 'publish_jobs',
    'analytics_snapshots', 'activity_events', 'notifications', 'project_assets'] LOOP
    EXECUTE format('ALTER TABLE public.%1$s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_read_own ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_read_own ON public.%1$s FOR SELECT TO authenticated USING (owner_id = auth.uid())', t);
  END LOOP;
END $$;
ALTER TABLE public.oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_errors ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Realtime: what the UI subscribes to (owner RLS applies to change feeds)
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  FOREACH t IN ARRAY ARRAY['projects', 'generation_runs', 'contents', 'video_renders', 'publish_jobs',
    'activity_events', 'messages', 'project_assets'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- storage: private buckets, objects under "<owner_id>/…"
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public) VALUES ('renders', 'renders', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('assets', 'assets', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS storage_renders_select_own ON storage.objects;
CREATE POLICY storage_renders_select_own ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'renders' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS storage_assets_select_own ON storage.objects;
CREATE POLICY storage_assets_select_own ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'assets' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- content setup (phase 2): plan → storyboard → production
-- content_plan = { format: single|series, style: daily|episodic|standalone, seriesTitle, why }
-- contents.label = "Day 1" / "Episode 2" (series only)
-- ---------------------------------------------------------------------------
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS content_stage text NOT NULL DEFAULT 'none' CHECK (content_stage IN ('none', 'plan', 'storyboard', 'production')),
  ADD COLUMN IF NOT EXISTS content_plan jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.contents ADD COLUMN IF NOT EXISTS label text;
-- storyboard step: one WF-01 run (kind storyboard) per content writes its script + scenes
ALTER TABLE public.contents ADD COLUMN IF NOT EXISTS script_status text NOT NULL DEFAULT 'none' CHECK (script_status IN ('none', 'writing', 'ready', 'failed'));
ALTER TABLE public.generation_runs DROP CONSTRAINT IF EXISTS generation_runs_kind_check;
ALTER TABLE public.generation_runs ADD CONSTRAINT generation_runs_kind_check CHECK (kind IN ('ideation', 'revision', 'storyboard'));
-- skipped = set aside by the creator (kept, restorable, never rendered); removed = gone (remembered for duplicates)
ALTER TABLE public.contents DROP CONSTRAINT IF EXISTS contents_status_check;
ALTER TABLE public.contents ADD CONSTRAINT contents_status_check CHECK (status IN ('idea', 'approved', 'skipped', 'removed'));
