import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deriveConsentTrack,
  type ConsentTrack,
} from "@/lib/consent-track";

export interface DecisionRow {
  conceptId: string;
  title: string;
  projectId: string;
  projectName: string;
  track: ConsentTrack;
}

export interface AgentRun {
  id: string;
  workflowType: string;
  stage: string | null;
  status: string;
  projectId: string | null;
  createdAt: string;
}

interface ConceptRow {
  id: string;
  title: string | null;
  project_id: string;
  working_version_id: string | null;
  latest_approved_version_id: string | null;
  projects: { name: string; status: string } | null;
}

interface VersionRow {
  id: string;
  review_status: "draft" | "pending_review" | "approved";
  approval_revoked_at: string | null;
}

interface GrantRow {
  project_id: string | null;
  valid_until: string | null;
}

interface JobRow {
  id: string;
  concept_id: string;
  created_at: string;
}

interface AttemptRow {
  id: string;
  video_job_id: string;
  attempt_number: number;
  status: string;
  approved_at: string | null;
  approval_revoked_at: string | null;
}

interface PublishRow {
  video_attempt_id: string;
  status: string;
  scheduled_for: string | null;
  created_at: string;
}

const QUEUE_LIMIT = 40;

const WAITING_ORDER: Record<ConsentTrack["waitingOn"], number> = {
  creator: 0,
  agent: 1,
  nobody: 2,
};

/**
 * Builds the creator's decision queue: every recent concept with its four-gate
 * consent track, creator-owed items first. Four dependent round trips, with the
 * independent lookups in step two run in parallel.
 */
export async function loadDecisionQueue(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<DecisionRow[]> {
  const { data: conceptData, error: conceptError } = await supabase
    .from("concepts")
    .select(
      "id, title, project_id, working_version_id, latest_approved_version_id, projects!inner(name, status)",
    )
    .eq("owner_id", ownerId)
    .neq("projects.status", "archived")
    .order("updated_at", { ascending: false })
    .limit(QUEUE_LIMIT);

  if (conceptError) {
    console.error("[overview] concepts query failed", conceptError.message);
    return [];
  }

  const concepts = (conceptData ?? []) as unknown as ConceptRow[];
  if (concepts.length === 0) return [];

  const conceptIds = concepts.map((c) => c.id);
  const versionIds = Array.from(
    new Set(
      concepts
        .flatMap((c) => [c.working_version_id, c.latest_approved_version_id])
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const [versionsRes, grantsRes, jobsRes] = await Promise.all([
    versionIds.length > 0
      ? supabase
          .from("concept_versions")
          .select("id, review_status, approval_revoked_at")
          .in("id", versionIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("authorization_grants")
      .select("project_id, valid_until")
      .eq("owner_id", ownerId)
      .eq("scope", "produce_paid_media")
      .is("revoked_at", null),
    supabase
      .from("video_jobs")
      .select("id, concept_id, created_at")
      .eq("owner_id", ownerId)
      .in("concept_id", conceptIds)
      .order("created_at", { ascending: false }),
  ]);

  const versions = new Map(
    ((versionsRes.data ?? []) as VersionRow[]).map((v) => [v.id, v]),
  );
  const grants = (grantsRes.data ?? []) as GrantRow[];

  // The newest job per concept is the one the creator is reviewing.
  const latestJobByConcept = new Map<string, JobRow>();
  for (const job of (jobsRes.data ?? []) as JobRow[]) {
    if (!latestJobByConcept.has(job.concept_id)) {
      latestJobByConcept.set(job.concept_id, job);
    }
  }

  const jobIds = Array.from(latestJobByConcept.values()).map((j) => j.id);
  const latestAttemptByJob = new Map<string, AttemptRow>();
  if (jobIds.length > 0) {
    const { data: attemptData } = await supabase
      .from("video_attempts")
      .select(
        "id, video_job_id, attempt_number, status, approved_at, approval_revoked_at",
      )
      .in("video_job_id", jobIds)
      .order("attempt_number", { ascending: false });
    for (const attempt of (attemptData ?? []) as AttemptRow[]) {
      if (!latestAttemptByJob.has(attempt.video_job_id)) {
        latestAttemptByJob.set(attempt.video_job_id, attempt);
      }
    }
  }

  const attemptIds = Array.from(latestAttemptByJob.values()).map((a) => a.id);
  const latestPublishByAttempt = new Map<string, PublishRow>();
  if (attemptIds.length > 0) {
    const { data: publishData } = await supabase
      .from("publishing_jobs")
      .select("video_attempt_id, status, scheduled_for, created_at")
      .eq("owner_id", ownerId)
      .in("video_attempt_id", attemptIds)
      .order("created_at", { ascending: false });
    for (const job of (publishData ?? []) as PublishRow[]) {
      if (!latestPublishByAttempt.has(job.video_attempt_id)) {
        latestPublishByAttempt.set(job.video_attempt_id, job);
      }
    }
  }

  const now = Date.now();
  const rows = concepts.map((concept): DecisionRow => {
    const working = concept.working_version_id
      ? versions.get(concept.working_version_id) ?? null
      : null;
    const approved = concept.latest_approved_version_id
      ? versions.get(concept.latest_approved_version_id) ?? null
      : null;

    const spendAuthorized = grants.some(
      (grant) =>
        (grant.project_id === null || grant.project_id === concept.project_id) &&
        (grant.valid_until === null || new Date(grant.valid_until).getTime() > now),
    );

    const job = latestJobByConcept.get(concept.id);
    const attempt = job ? latestAttemptByJob.get(job.id) ?? null : null;
    const publish = attempt ? latestPublishByAttempt.get(attempt.id) ?? null : null;

    return {
      conceptId: concept.id,
      title: concept.title?.trim() || "Untitled concept",
      projectId: concept.project_id,
      projectName: concept.projects?.name ?? "Project",
      track: deriveConsentTrack({
        conceptId: concept.id,
        workingReviewStatus: working?.review_status ?? null,
        conceptApproved: Boolean(
          approved &&
            approved.review_status === "approved" &&
            !approved.approval_revoked_at,
        ),
        spendAuthorized,
        video: attempt
          ? {
              attemptId: attempt.id,
              status: attempt.status,
              approved:
                (attempt.status === "approved" || Boolean(attempt.approved_at)) &&
                !attempt.approval_revoked_at,
            }
          : null,
        publish: publish
          ? { status: publish.status, scheduledFor: publish.scheduled_for }
          : null,
      }),
    };
  });

  // Stable sort keeps the most recently updated concepts first within each group.
  return rows.sort(
    (a, b) => WAITING_ORDER[a.track.waitingOn] - WAITING_ORDER[b.track.waitingOn],
  );
}

/** Latest agent and workflow runs, straight from workflow_runs. */
export async function loadRecentRuns(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<AgentRun[]> {
  const { data, error } = await supabase
    .from("workflow_runs")
    .select("id, workflow_type, stage, status, project_id, created_at")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(4);

  if (error) {
    console.error("[overview] workflow_runs query failed", error.message);
    return [];
  }

  return (data ?? []).map((run) => ({
    id: run.id as string,
    workflowType: run.workflow_type as string,
    stage: (run.stage as string | null) ?? null,
    status: run.status as string,
    projectId: (run.project_id as string | null) ?? null,
    createdAt: run.created_at as string,
  }));
}
