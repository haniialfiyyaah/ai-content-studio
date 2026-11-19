-- =============================================================================
-- AI Content Studio — initial schema (TDD v2.2)
-- UUID PKs, timestamps, owner-scoped RLS, private storage buckets.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at() IS
  'Before-update trigger helper that stamps updated_at = now().';

-- ---------------------------------------------------------------------------
-- 1. profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  timezone text NOT NULL DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url, timezone)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data ->> 'display_name',
      NEW.raw_user_meta_data ->> 'full_name',
      split_part(COALESCE(NEW.email, ''), '@', 1)
    ),
    NEW.raw_user_meta_data ->> 'avatar_url',
    COALESCE(NEW.raw_user_meta_data ->> 'timezone', 'UTC')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. projects
-- ---------------------------------------------------------------------------

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  objective text,
  content_mode text NOT NULL DEFAULT 'independent'
    CHECK (content_mode IN ('independent', 'series')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'stopped', 'archived')),
  timezone text NOT NULL DEFAULT 'UTC',
  default_production_mode text NOT NULL DEFAULT 'remotion'
    CHECK (default_production_mode IN ('remotion', 'fal', 'hybrid')),
  default_model_id text,
  preferred_destinations jsonb NOT NULL DEFAULT '[]'::jsonb,
  creative_context_version integer NOT NULL DEFAULT 1,
  settings_version integer NOT NULL DEFAULT 1,
  activated_at timestamptz,
  paused_at timestamptz,
  stopped_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX projects_owner_id_idx ON public.projects (owner_id);
CREATE INDEX projects_status_idx ON public.projects (status);
CREATE INDEX projects_owner_status_idx ON public.projects (owner_id, status);

CREATE TRIGGER projects_set_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. project_brand_kits (Creative Kit snapshots)
-- ---------------------------------------------------------------------------

CREATE TABLE public.project_brand_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  version integer NOT NULL,
  language_default text,
  tone text,
  audience text,
  brand_or_creator_name text,
  do_say jsonb NOT NULL DEFAULT '[]'::jsonb,
  dont_say jsonb NOT NULL DEFAULT '[]'::jsonb,
  visual_notes text,
  brand_asset_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  reference_profile_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  generation_defaults jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);

CREATE INDEX project_brand_kits_project_id_idx
  ON public.project_brand_kits (project_id);

CREATE TRIGGER project_brand_kits_set_updated_at
  BEFORE UPDATE ON public.project_brand_kits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. concepts (version FKs added after concept_versions)
-- ---------------------------------------------------------------------------

CREATE TABLE public.concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text,
  original_input text,
  source text
    CHECK (source IS NULL OR source IN ('web', 'telegram', 'agent', 'schedule', 'import')),
  content_type text,
  series_order integer,
  selected_for_initial_launch boolean NOT NULL DEFAULT false,
  working_version_id uuid,
  latest_approved_version_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX concepts_project_id_idx ON public.concepts (project_id);
CREATE INDEX concepts_owner_id_idx ON public.concepts (owner_id);
CREATE INDEX concepts_selected_for_initial_launch_idx
  ON public.concepts (project_id)
  WHERE selected_for_initial_launch = true;

CREATE TRIGGER concepts_set_updated_at
  BEFORE UPDATE ON public.concepts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. concept_versions
-- ---------------------------------------------------------------------------

CREATE TABLE public.concept_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id uuid NOT NULL REFERENCES public.concepts (id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  review_status text NOT NULL DEFAULT 'draft'
    CHECK (review_status IN ('draft', 'pending_review', 'approved')),
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  brand_kit_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  visual_plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  publishing_pack jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_asset_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  approved_at timestamptz,
  approval_revoked_at timestamptz,
  supersedes_version_id uuid REFERENCES public.concept_versions (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (concept_id, version_number)
);

CREATE INDEX concept_versions_concept_id_idx
  ON public.concept_versions (concept_id);
CREATE INDEX concept_versions_review_status_idx
  ON public.concept_versions (review_status);

CREATE TRIGGER concept_versions_set_updated_at
  BEFORE UPDATE ON public.concept_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Deferred FKs: concepts → concept_versions
ALTER TABLE public.concepts
  ADD CONSTRAINT concepts_working_version_id_fkey
  FOREIGN KEY (working_version_id) REFERENCES public.concept_versions (id)
  ON DELETE SET NULL;

ALTER TABLE public.concepts
  ADD CONSTRAINT concepts_latest_approved_version_id_fkey
  FOREIGN KEY (latest_approved_version_id) REFERENCES public.concept_versions (id)
  ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 11 (early). agent_conversations — needed by media_assets / telegram_links
-- ---------------------------------------------------------------------------

CREATE TABLE public.agent_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects (id) ON DELETE SET NULL,
  title text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'closed')),
  summary_version integer NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agent_conversations_owner_id_idx
  ON public.agent_conversations (owner_id);
CREATE INDEX agent_conversations_project_id_idx
  ON public.agent_conversations (project_id);
CREATE INDEX agent_conversations_last_message_at_idx
  ON public.agent_conversations (last_message_at DESC NULLS LAST);

CREATE TRIGGER agent_conversations_set_updated_at
  BEFORE UPDATE ON public.agent_conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. media_assets
-- ---------------------------------------------------------------------------

CREATE TABLE public.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects (id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.agent_conversations (id) ON DELETE SET NULL,
  concept_id uuid REFERENCES public.concepts (id) ON DELETE SET NULL,
  kind text NOT NULL
    CHECK (kind IN ('image', 'audio', 'video', 'document', 'other')),
  storage_bucket text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  width integer,
  height integer,
  duration_ms integer,
  checksum text,
  source_type text
    CHECK (source_type IS NULL OR source_type IN ('upload', 'generated', 'imported', 'derived')),
  provider text,
  model_id text,
  prompt_snapshot text,
  source_asset_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  licensing jsonb NOT NULL DEFAULT '{}'::jsonb,
  factual_reference_status text
    CHECK (
      factual_reference_status IS NULL
      OR factual_reference_status IN ('none', 'unverified', 'verified', 'needs_review', 'mixed')
    ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX media_assets_owner_id_idx ON public.media_assets (owner_id);
CREATE INDEX media_assets_project_id_idx ON public.media_assets (project_id);
CREATE INDEX media_assets_concept_id_idx ON public.media_assets (concept_id);
CREATE INDEX media_assets_conversation_id_idx ON public.media_assets (conversation_id);
CREATE INDEX media_assets_deleted_at_idx
  ON public.media_assets (deleted_at)
  WHERE deleted_at IS NULL;

CREATE TRIGGER media_assets_set_updated_at
  BEFORE UPDATE ON public.media_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 7. video_jobs
-- ---------------------------------------------------------------------------

CREATE TABLE public.video_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  concept_id uuid NOT NULL REFERENCES public.concepts (id) ON DELETE CASCADE,
  concept_version_id uuid NOT NULL REFERENCES public.concept_versions (id),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  production_mode text NOT NULL
    CHECK (production_mode IN ('remotion', 'fal', 'hybrid')),
  requested_provider_model text,
  render_contract_version text NOT NULL DEFAULT '1',
  input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN (
      'queued',
      'preparing',
      'generating',
      'rendering',
      'validating',
      'ready_for_review',
      'blocked',
      'failed',
      'cancel_requested',
      'cancelled',
      'reconciling'
    )),
  consent_id uuid,
  estimated_cost numeric(18, 6),
  reserved_cost numeric(18, 6),
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX video_jobs_owner_id_idx ON public.video_jobs (owner_id);
CREATE INDEX video_jobs_project_id_idx ON public.video_jobs (project_id);
CREATE INDEX video_jobs_concept_id_idx ON public.video_jobs (concept_id);
CREATE INDEX video_jobs_concept_version_id_idx ON public.video_jobs (concept_version_id);
CREATE INDEX video_jobs_status_idx ON public.video_jobs (status);

CREATE TRIGGER video_jobs_set_updated_at
  BEFORE UPDATE ON public.video_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 8. video_attempts
-- ---------------------------------------------------------------------------

CREATE TABLE public.video_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_job_id uuid NOT NULL REFERENCES public.video_jobs (id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  provider text,
  model_id text,
  provider_request_id text,
  input_checksum text,
  settings_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN (
      'queued',
      'preparing',
      'generating',
      'rendering',
      'validating',
      'ready_for_review',
      'approved',
      'blocked',
      'failed',
      'cancel_requested',
      'cancelled',
      'reconciling'
    )),
  output_asset_id uuid REFERENCES public.media_assets (id) ON DELETE SET NULL,
  quality_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  estimated_cost numeric(18, 6),
  actual_cost numeric(18, 6),
  render_started_at timestamptz,
  render_finished_at timestamptz,
  approved_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  approved_at timestamptz,
  approval_revoked_at timestamptz,
  error_code text,
  error_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (video_job_id, attempt_number)
);

CREATE UNIQUE INDEX video_attempts_provider_request_id_uidx
  ON public.video_attempts (provider, provider_request_id)
  WHERE provider_request_id IS NOT NULL;

CREATE INDEX video_attempts_video_job_id_idx ON public.video_attempts (video_job_id);
CREATE INDEX video_attempts_status_idx ON public.video_attempts (status);
CREATE INDEX video_attempts_output_asset_id_idx ON public.video_attempts (output_asset_id);

CREATE TRIGGER video_attempts_set_updated_at
  BEFORE UPDATE ON public.video_attempts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 9. connected_accounts
-- ---------------------------------------------------------------------------

CREATE TABLE public.connected_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  platform text NOT NULL,
  provider_account_id text,
  display_name text,
  credential_reference text,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  token_expires_at timestamptz,
  status text NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'expired', 'revoked', 'disconnected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX connected_accounts_owner_id_idx ON public.connected_accounts (owner_id);
CREATE INDEX connected_accounts_platform_idx ON public.connected_accounts (platform);
CREATE INDEX connected_accounts_status_idx ON public.connected_accounts (status);

CREATE TRIGGER connected_accounts_set_updated_at
  BEFORE UPDATE ON public.connected_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 10. publishing_jobs
-- ---------------------------------------------------------------------------

CREATE TABLE public.publishing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  video_attempt_id uuid NOT NULL REFERENCES public.video_attempts (id),
  output_asset_id uuid NOT NULL REFERENCES public.media_assets (id),
  connected_account_id uuid NOT NULL REFERENCES public.connected_accounts (id),
  metadata_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduled_for timestamptz,
  timezone text,
  authorization_id uuid,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft_intent'
    CHECK (status IN (
      'draft_intent',
      'blocked',
      'scheduled',
      'held',
      'publishing',
      'published',
      'failed',
      'cancel_requested',
      'cancelled',
      'reconciling'
    )),
  provider_post_id text,
  provider_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX publishing_jobs_owner_id_idx ON public.publishing_jobs (owner_id);
CREATE INDEX publishing_jobs_project_id_idx ON public.publishing_jobs (project_id);
CREATE INDEX publishing_jobs_video_attempt_id_idx ON public.publishing_jobs (video_attempt_id);
CREATE INDEX publishing_jobs_status_idx ON public.publishing_jobs (status);
CREATE INDEX publishing_jobs_scheduled_for_idx ON public.publishing_jobs (scheduled_for);

CREATE TRIGGER publishing_jobs_set_updated_at
  BEFORE UPDATE ON public.publishing_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 12. agent_messages
-- ---------------------------------------------------------------------------

CREATE TABLE public.agent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.agent_conversations (id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL
    CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content text NOT NULL DEFAULT '',
  source_surface text
    CHECK (source_surface IS NULL OR source_surface IN ('web', 'telegram', 'system', 'tool')),
  source_message_id text,
  attachment_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  tool_call_id text,
  model_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz
);

CREATE UNIQUE INDEX agent_messages_source_dedupe_uidx
  ON public.agent_messages (source_surface, source_message_id)
  WHERE source_message_id IS NOT NULL;

CREATE INDEX agent_messages_conversation_id_idx
  ON public.agent_messages (conversation_id);
CREATE INDEX agent_messages_owner_id_idx ON public.agent_messages (owner_id);
CREATE INDEX agent_messages_created_at_idx
  ON public.agent_messages (conversation_id, created_at);

CREATE TRIGGER agent_messages_set_updated_at
  BEFORE UPDATE ON public.agent_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 13. telegram_links
-- ---------------------------------------------------------------------------

CREATE TABLE public.telegram_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  telegram_user_id bigint NOT NULL,
  telegram_chat_id bigint,
  link_challenge_hash text,
  linked_at timestamptz,
  revoked_at timestamptz,
  default_conversation_id uuid REFERENCES public.agent_conversations (id) ON DELETE SET NULL,
  preferred_project_id uuid REFERENCES public.projects (id) ON DELETE SET NULL,
  notifications_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX telegram_links_active_user_uidx
  ON public.telegram_links (telegram_user_id)
  WHERE revoked_at IS NULL;

CREATE INDEX telegram_links_owner_id_idx ON public.telegram_links (owner_id);
CREATE INDEX telegram_links_chat_id_idx ON public.telegram_links (telegram_chat_id);

CREATE TRIGGER telegram_links_set_updated_at
  BEFORE UPDATE ON public.telegram_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 14. automation_rules
-- ---------------------------------------------------------------------------

CREATE TABLE public.automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  kind text NOT NULL
    CHECK (kind IN ('ideation', 'publishing_slots', 'notifications', 'analytics', 'research')),
  enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'enabled'
    CHECK (status IN ('enabled', 'paused', 'disabled', 'stopped')),
  schedule_definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  timezone text NOT NULL DEFAULT 'UTC',
  next_due_at timestamptz,
  last_run_at timestamptz,
  missed_run_policy text NOT NULL DEFAULT 'skip'
    CHECK (missed_run_policy IN ('skip', 'catch_up')),
  strategy text,
  policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX automation_rules_owner_id_idx ON public.automation_rules (owner_id);
CREATE INDEX automation_rules_project_id_idx ON public.automation_rules (project_id);
CREATE INDEX automation_rules_next_due_at_idx
  ON public.automation_rules (next_due_at)
  WHERE enabled = true AND status = 'enabled';

CREATE TRIGGER automation_rules_set_updated_at
  BEFORE UPDATE ON public.automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 15. approval_events
-- ---------------------------------------------------------------------------

CREATE TABLE public.approval_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  object_type text NOT NULL,
  object_id uuid NOT NULL,
  version_or_attempt_id uuid,
  event text NOT NULL
    CHECK (event IN ('approved', 'revoked')),
  policy text,
  reason text,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX approval_events_owner_id_idx ON public.approval_events (owner_id);
CREATE INDEX approval_events_object_idx
  ON public.approval_events (object_type, object_id);
CREATE INDEX approval_events_request_id_idx ON public.approval_events (request_id);

-- ---------------------------------------------------------------------------
-- 16. authorization_grants
-- ---------------------------------------------------------------------------

CREATE TABLE public.authorization_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  scope text NOT NULL
    CHECK (scope IN (
      'activate_project',
      'auto_approve_concept',
      'auto_approve_video',
      'produce_paid_media',
      'publish_destination',
      'spend_limit'
    )),
  project_id uuid REFERENCES public.projects (id) ON DELETE CASCADE,
  destination_id uuid REFERENCES public.connected_accounts (id) ON DELETE SET NULL,
  limit_amount numeric(18, 6),
  currency text,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  revoked_at timestamptz,
  policy_version text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX authorization_grants_owner_id_idx ON public.authorization_grants (owner_id);
CREATE INDEX authorization_grants_project_id_idx ON public.authorization_grants (project_id);
CREATE INDEX authorization_grants_scope_idx ON public.authorization_grants (scope);
CREATE INDEX authorization_grants_active_idx
  ON public.authorization_grants (owner_id, scope)
  WHERE revoked_at IS NULL;

CREATE TRIGGER authorization_grants_set_updated_at
  BEFORE UPDATE ON public.authorization_grants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 17. cost_events
-- ---------------------------------------------------------------------------

CREATE TABLE public.cost_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects (id) ON DELETE SET NULL,
  event_type text NOT NULL
    CHECK (event_type IN (
      'reservation',
      'settlement',
      'release',
      'adjustment',
      'refund'
    )),
  amount numeric(18, 6) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  provider text,
  model_id text,
  job_id uuid,
  request_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cost_events_owner_id_idx ON public.cost_events (owner_id);
CREATE INDEX cost_events_project_id_idx ON public.cost_events (project_id);
CREATE INDEX cost_events_job_id_idx ON public.cost_events (job_id);
CREATE INDEX cost_events_request_id_idx ON public.cost_events (request_id);
CREATE INDEX cost_events_created_at_idx ON public.cost_events (created_at DESC);

-- ---------------------------------------------------------------------------
-- 18. workflow_runs
-- ---------------------------------------------------------------------------

CREATE TABLE public.workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects (id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.agent_conversations (id) ON DELETE SET NULL,
  workflow_type text NOT NULL,
  n8n_execution_id text,
  correlation_id text,
  idempotency_key text UNIQUE,
  input_reference jsonb NOT NULL DEFAULT '{}'::jsonb,
  stage text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN (
      'queued',
      'running',
      'completed',
      'failed',
      'cancelled',
      'needs_input',
      'partial'
    )),
  step_statuses jsonb NOT NULL DEFAULT '{}'::jsonb,
  failure_category text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX workflow_runs_owner_id_idx ON public.workflow_runs (owner_id);
CREATE INDEX workflow_runs_project_id_idx ON public.workflow_runs (project_id);
CREATE INDEX workflow_runs_conversation_id_idx ON public.workflow_runs (conversation_id);
CREATE INDEX workflow_runs_status_idx ON public.workflow_runs (status);
CREATE INDEX workflow_runs_correlation_id_idx ON public.workflow_runs (correlation_id);
CREATE INDEX workflow_runs_n8n_execution_id_idx ON public.workflow_runs (n8n_execution_id);

CREATE TRIGGER workflow_runs_set_updated_at
  BEFORE UPDATE ON public.workflow_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 19. workflow_run_events
-- ---------------------------------------------------------------------------

CREATE TABLE public.workflow_run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.workflow_runs (id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  stage text,
  state text,
  message text,
  available_section_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, sequence)
);

CREATE INDEX workflow_run_events_run_id_idx
  ON public.workflow_run_events (run_id, sequence);

-- ---------------------------------------------------------------------------
-- 20. outbox_events
-- ---------------------------------------------------------------------------

CREATE TABLE public.outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  aggregate_type text,
  aggregate_id uuid,
  aggregate_version integer,
  due_at timestamptz NOT NULL DEFAULT now(),
  claimed_by text,
  claim_expires_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  dispatched_at timestamptz,
  acknowledged_at timestamptz,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'claimed',
      'dispatched',
      'acknowledged',
      'failed',
      'dead'
    )),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX outbox_events_owner_id_idx ON public.outbox_events (owner_id);
-- Claim workers filter due/unclaimed pending rows; expiry is evaluated at query time.
CREATE INDEX outbox_events_due_unclaimed_idx
  ON public.outbox_events (due_at)
  WHERE status IN ('pending', 'failed') AND claimed_by IS NULL;
CREATE INDEX outbox_events_claim_expires_idx
  ON public.outbox_events (claim_expires_at)
  WHERE status = 'claimed';
CREATE INDEX outbox_events_aggregate_idx
  ON public.outbox_events (aggregate_type, aggregate_id);
CREATE INDEX outbox_events_status_idx ON public.outbox_events (status);

CREATE TRIGGER outbox_events_set_updated_at
  BEFORE UPDATE ON public.outbox_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 21. audit_events
-- ---------------------------------------------------------------------------

CREATE TABLE public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  actor_type text NOT NULL
    CHECK (actor_type IN ('user', 'agent_tool', 'service', 'system')),
  actor_id uuid,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  before_summary jsonb,
  after_summary jsonb,
  correlation_id text,
  source_surface text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_owner_id_idx ON public.audit_events (owner_id);
CREATE INDEX audit_events_target_idx ON public.audit_events (target_type, target_id);
CREATE INDEX audit_events_correlation_id_idx ON public.audit_events (correlation_id);
CREATE INDEX audit_events_created_at_idx ON public.audit_events (created_at DESC);

-- ---------------------------------------------------------------------------
-- 22. notifications
-- ---------------------------------------------------------------------------

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects (id) ON DELETE SET NULL,
  channel text NOT NULL
    CHECK (channel IN ('in_app', 'telegram', 'email')),
  template text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivery_state text NOT NULL DEFAULT 'pending'
    CHECK (delivery_state IN (
      'pending',
      'scheduled',
      'delivered',
      'failed',
      'cancelled'
    )),
  scheduled_for timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_owner_id_idx ON public.notifications (owner_id);
CREATE INDEX notifications_project_id_idx ON public.notifications (project_id);
CREATE INDEX notifications_delivery_state_idx ON public.notifications (delivery_state);
CREATE INDEX notifications_scheduled_for_idx ON public.notifications (scheduled_for);

CREATE TRIGGER notifications_set_updated_at
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 23. ai_provider_preferences
-- ---------------------------------------------------------------------------

CREATE TABLE public.ai_provider_preferences (
  owner_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  openai_mode text NOT NULL DEFAULT 'managed'
    CHECK (openai_mode IN ('managed', 'byok')),
  preferred_model_id text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER ai_provider_preferences_set_updated_at
  BEFORE UPDATE ON public.ai_provider_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 24. ai_provider_connections
-- ---------------------------------------------------------------------------

CREATE TABLE public.ai_provider_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'openai'
    CHECK (provider IN ('openai')),
  secret_reference text NOT NULL,
  key_fingerprint text,
  last4 text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'connected', 'invalid', 'revoked', 'disconnected')),
  verified_at timestamptz,
  last_error_code text,
  rotated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, provider)
);

CREATE INDEX ai_provider_connections_owner_id_idx
  ON public.ai_provider_connections (owner_id);
CREATE INDEX ai_provider_connections_status_idx
  ON public.ai_provider_connections (status);

CREATE TRIGGER ai_provider_connections_set_updated_at
  BEFORE UPDATE ON public.ai_provider_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 25. ai_usage_events
-- ---------------------------------------------------------------------------

CREATE TABLE public.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects (id) ON DELETE SET NULL,
  mode text NOT NULL
    CHECK (mode IN ('managed', 'byok')),
  model_id text,
  tokens_in integer,
  tokens_out integer,
  estimated_cost numeric(18, 6),
  request_id text,
  workflow_run_id uuid REFERENCES public.workflow_runs (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_usage_events_owner_id_idx ON public.ai_usage_events (owner_id);
CREATE INDEX ai_usage_events_project_id_idx ON public.ai_usage_events (project_id);
CREATE INDEX ai_usage_events_workflow_run_id_idx ON public.ai_usage_events (workflow_run_id);
CREATE INDEX ai_usage_events_request_id_idx ON public.ai_usage_events (request_id);
CREATE INDEX ai_usage_events_created_at_idx ON public.ai_usage_events (created_at DESC);

-- ---------------------------------------------------------------------------
-- 26. ai_usage_policy
-- ---------------------------------------------------------------------------

CREATE TABLE public.ai_usage_policy (
  owner_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  managed_monthly_allowance numeric(18, 6) NOT NULL DEFAULT 0,
  managed_used numeric(18, 6) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER ai_usage_policy_set_updated_at
  BEFORE UPDATE ON public.ai_usage_policy
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_brand_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concept_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connected_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publishing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authorization_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_run_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_provider_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_provider_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_policy ENABLE ROW LEVEL SECURITY;

-- profiles: id = auth.uid()
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY profiles_delete_own ON public.profiles
  FOR DELETE TO authenticated
  USING (id = auth.uid());

-- Helper macro pattern: owner_id = auth.uid() for owned tables
-- projects
CREATE POLICY projects_select_own ON public.projects
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY projects_insert_own ON public.projects
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY projects_update_own ON public.projects
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY projects_delete_own ON public.projects
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- project_brand_kits via projects
CREATE POLICY project_brand_kits_select_own ON public.project_brand_kits
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_brand_kits.project_id
        AND p.owner_id = auth.uid()
    )
  );
CREATE POLICY project_brand_kits_insert_own ON public.project_brand_kits
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_brand_kits.project_id
        AND p.owner_id = auth.uid()
    )
  );
CREATE POLICY project_brand_kits_update_own ON public.project_brand_kits
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_brand_kits.project_id
        AND p.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_brand_kits.project_id
        AND p.owner_id = auth.uid()
    )
  );
CREATE POLICY project_brand_kits_delete_own ON public.project_brand_kits
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_brand_kits.project_id
        AND p.owner_id = auth.uid()
    )
  );

-- concepts
CREATE POLICY concepts_select_own ON public.concepts
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY concepts_insert_own ON public.concepts
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY concepts_update_own ON public.concepts
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY concepts_delete_own ON public.concepts
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- concept_versions via concepts
CREATE POLICY concept_versions_select_own ON public.concept_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.concepts c
      WHERE c.id = concept_versions.concept_id
        AND c.owner_id = auth.uid()
    )
  );
CREATE POLICY concept_versions_insert_own ON public.concept_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.concepts c
      WHERE c.id = concept_versions.concept_id
        AND c.owner_id = auth.uid()
    )
  );
CREATE POLICY concept_versions_update_own ON public.concept_versions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.concepts c
      WHERE c.id = concept_versions.concept_id
        AND c.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.concepts c
      WHERE c.id = concept_versions.concept_id
        AND c.owner_id = auth.uid()
    )
  );
CREATE POLICY concept_versions_delete_own ON public.concept_versions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.concepts c
      WHERE c.id = concept_versions.concept_id
        AND c.owner_id = auth.uid()
    )
  );

-- media_assets
CREATE POLICY media_assets_select_own ON public.media_assets
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY media_assets_insert_own ON public.media_assets
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY media_assets_update_own ON public.media_assets
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY media_assets_delete_own ON public.media_assets
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- video_jobs
CREATE POLICY video_jobs_select_own ON public.video_jobs
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY video_jobs_insert_own ON public.video_jobs
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY video_jobs_update_own ON public.video_jobs
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY video_jobs_delete_own ON public.video_jobs
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- video_attempts via video_jobs
CREATE POLICY video_attempts_select_own ON public.video_attempts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.video_jobs vj
      WHERE vj.id = video_attempts.video_job_id
        AND vj.owner_id = auth.uid()
    )
  );
CREATE POLICY video_attempts_insert_own ON public.video_attempts
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.video_jobs vj
      WHERE vj.id = video_attempts.video_job_id
        AND vj.owner_id = auth.uid()
    )
  );
CREATE POLICY video_attempts_update_own ON public.video_attempts
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.video_jobs vj
      WHERE vj.id = video_attempts.video_job_id
        AND vj.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.video_jobs vj
      WHERE vj.id = video_attempts.video_job_id
        AND vj.owner_id = auth.uid()
    )
  );
CREATE POLICY video_attempts_delete_own ON public.video_attempts
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.video_jobs vj
      WHERE vj.id = video_attempts.video_job_id
        AND vj.owner_id = auth.uid()
    )
  );

-- connected_accounts
CREATE POLICY connected_accounts_select_own ON public.connected_accounts
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY connected_accounts_insert_own ON public.connected_accounts
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY connected_accounts_update_own ON public.connected_accounts
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY connected_accounts_delete_own ON public.connected_accounts
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- publishing_jobs
CREATE POLICY publishing_jobs_select_own ON public.publishing_jobs
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY publishing_jobs_insert_own ON public.publishing_jobs
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY publishing_jobs_update_own ON public.publishing_jobs
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY publishing_jobs_delete_own ON public.publishing_jobs
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- agent_conversations
CREATE POLICY agent_conversations_select_own ON public.agent_conversations
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY agent_conversations_insert_own ON public.agent_conversations
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY agent_conversations_update_own ON public.agent_conversations
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY agent_conversations_delete_own ON public.agent_conversations
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- agent_messages
CREATE POLICY agent_messages_select_own ON public.agent_messages
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY agent_messages_insert_own ON public.agent_messages
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY agent_messages_update_own ON public.agent_messages
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY agent_messages_delete_own ON public.agent_messages
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- telegram_links
CREATE POLICY telegram_links_select_own ON public.telegram_links
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY telegram_links_insert_own ON public.telegram_links
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY telegram_links_update_own ON public.telegram_links
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY telegram_links_delete_own ON public.telegram_links
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- automation_rules
CREATE POLICY automation_rules_select_own ON public.automation_rules
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY automation_rules_insert_own ON public.automation_rules
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY automation_rules_update_own ON public.automation_rules
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY automation_rules_delete_own ON public.automation_rules
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- approval_events
CREATE POLICY approval_events_select_own ON public.approval_events
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY approval_events_insert_own ON public.approval_events
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY approval_events_update_own ON public.approval_events
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY approval_events_delete_own ON public.approval_events
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- authorization_grants
CREATE POLICY authorization_grants_select_own ON public.authorization_grants
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY authorization_grants_insert_own ON public.authorization_grants
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY authorization_grants_update_own ON public.authorization_grants
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY authorization_grants_delete_own ON public.authorization_grants
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- cost_events
CREATE POLICY cost_events_select_own ON public.cost_events
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY cost_events_insert_own ON public.cost_events
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY cost_events_update_own ON public.cost_events
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY cost_events_delete_own ON public.cost_events
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- workflow_runs
CREATE POLICY workflow_runs_select_own ON public.workflow_runs
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY workflow_runs_insert_own ON public.workflow_runs
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY workflow_runs_update_own ON public.workflow_runs
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY workflow_runs_delete_own ON public.workflow_runs
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- workflow_run_events via workflow_runs
CREATE POLICY workflow_run_events_select_own ON public.workflow_run_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workflow_runs wr
      WHERE wr.id = workflow_run_events.run_id
        AND wr.owner_id = auth.uid()
    )
  );
CREATE POLICY workflow_run_events_insert_own ON public.workflow_run_events
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workflow_runs wr
      WHERE wr.id = workflow_run_events.run_id
        AND wr.owner_id = auth.uid()
    )
  );
CREATE POLICY workflow_run_events_update_own ON public.workflow_run_events
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workflow_runs wr
      WHERE wr.id = workflow_run_events.run_id
        AND wr.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workflow_runs wr
      WHERE wr.id = workflow_run_events.run_id
        AND wr.owner_id = auth.uid()
    )
  );
CREATE POLICY workflow_run_events_delete_own ON public.workflow_run_events
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workflow_runs wr
      WHERE wr.id = workflow_run_events.run_id
        AND wr.owner_id = auth.uid()
    )
  );

-- outbox_events (nullable owner_id — users only see their own rows)
CREATE POLICY outbox_events_select_own ON public.outbox_events
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY outbox_events_insert_own ON public.outbox_events
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY outbox_events_update_own ON public.outbox_events
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY outbox_events_delete_own ON public.outbox_events
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- audit_events
CREATE POLICY audit_events_select_own ON public.audit_events
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY audit_events_insert_own ON public.audit_events
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY audit_events_update_own ON public.audit_events
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY audit_events_delete_own ON public.audit_events
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- notifications
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY notifications_insert_own ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY notifications_delete_own ON public.notifications
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- ai_provider_preferences
CREATE POLICY ai_provider_preferences_select_own ON public.ai_provider_preferences
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY ai_provider_preferences_insert_own ON public.ai_provider_preferences
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY ai_provider_preferences_update_own ON public.ai_provider_preferences
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY ai_provider_preferences_delete_own ON public.ai_provider_preferences
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- ai_provider_connections
CREATE POLICY ai_provider_connections_select_own ON public.ai_provider_connections
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY ai_provider_connections_insert_own ON public.ai_provider_connections
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY ai_provider_connections_update_own ON public.ai_provider_connections
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY ai_provider_connections_delete_own ON public.ai_provider_connections
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- ai_usage_events
CREATE POLICY ai_usage_events_select_own ON public.ai_usage_events
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY ai_usage_events_insert_own ON public.ai_usage_events
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY ai_usage_events_update_own ON public.ai_usage_events
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY ai_usage_events_delete_own ON public.ai_usage_events
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- ai_usage_policy
CREATE POLICY ai_usage_policy_select_own ON public.ai_usage_policy
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY ai_usage_policy_insert_own ON public.ai_usage_policy
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY ai_usage_policy_update_own ON public.ai_usage_policy
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY ai_usage_policy_delete_own ON public.ai_usage_policy
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- =============================================================================
-- Storage: private buckets + owner-folder policies
-- Path convention: {auth.uid()}/...
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('media', 'media', false),
  ('renders', 'renders', false)
ON CONFLICT (id) DO NOTHING;

-- media bucket
CREATE POLICY storage_media_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY storage_media_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY storage_media_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY storage_media_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- renders bucket
CREATE POLICY storage_renders_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'renders'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY storage_renders_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'renders'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY storage_renders_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'renders'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'renders'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY storage_renders_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'renders'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
