import { AppError, ErrorCodes, listStaleQueuedVideoJobs } from "@acs/domain";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api/response";
import { assertInternalServiceAuth } from "@/lib/internal-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const ClaimDueSchema = z.object({
  kind: z.enum([
    "ideation",
    "publishing_jobs",
    "notifications",
    "analytics",
    "reconciliation",
    "research",
    "video_jobs",
  ]),
  limit: z.number().int().positive().max(50).default(10),
  correlationId: z.string().optional(),
});

/**
 * POST /api/internal/automation/claim-due
 * Claims due recurring work without duplication (stub leasing).
 */
export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();

  try {
    assertInternalServiceAuth(request);
    const body = ClaimDueSchema.parse(await request.json());
    const supabase = createAdminClient();
    const now = new Date().toISOString();
    const limit = body.limit;

    if (body.kind === "publishing_jobs") {
      const { data: jobs, error } = await supabase
        .from("publishing_jobs")
        .select(
          "id, owner_id, project_id, video_attempt_id, connected_account_id, scheduled_for, status, idempotency_key",
        )
        .eq("status", "scheduled")
        .lte("scheduled_for", now)
        .order("scheduled_for", { ascending: true })
        .limit(limit);

      if (error) {
        throw new AppError(
          ErrorCodes.INTERNAL_ERROR,
          "Failed to claim publishing jobs",
          500,
        );
      }

      const claimed = [];
      for (const job of jobs ?? []) {
        const { data: updated } = await supabase
          .from("publishing_jobs")
          .update({ status: "publishing" })
          .eq("id", job.id)
          .eq("status", "scheduled")
          .select(
            "id, owner_id, project_id, video_attempt_id, connected_account_id, scheduled_for, status, idempotency_key",
          )
          .maybeSingle();

        if (updated) {
          claimed.push({
            jobId: updated.id,
            publishingJobId: updated.id,
            ownerId: updated.owner_id,
            projectId: updated.project_id,
            videoAttemptId: updated.video_attempt_id,
            connectedAccountId: updated.connected_account_id,
            scheduledFor: updated.scheduled_for,
            idempotencyKey: updated.idempotency_key,
            correlationId: updated.idempotency_key,
            platform: "unknown",
          });
        }
      }

      return jsonOk(
        { kind: body.kind, jobs: claimed },
        body.correlationId ?? correlationId,
      );
    }

    if (body.kind === "notifications") {
      const { data: rows, error } = await supabase
        .from("notifications")
        .select(
          "id, owner_id, project_id, channel, template, payload, scheduled_for",
        )
        .in("delivery_state", ["pending", "scheduled"])
        .or(`scheduled_for.is.null,scheduled_for.lte.${now}`)
        .order("created_at", { ascending: true })
        .limit(limit);

      if (error) {
        throw new AppError(
          ErrorCodes.INTERNAL_ERROR,
          "Failed to claim notifications",
          500,
        );
      }

      const notifications = (rows ?? []).map((row) => {
        const payload =
          row.payload &&
          typeof row.payload === "object" &&
          !Array.isArray(row.payload)
            ? (row.payload as Record<string, unknown>)
            : {};
        return {
          jobId: row.id,
          notificationId: row.id,
          ownerId: row.owner_id,
          projectId: row.project_id,
          channel: row.channel,
          template: row.template,
          scheduledFor: row.scheduled_for,
          deliveryAllowed: true,
          previewText:
            typeof payload.previewText === "string"
              ? payload.previewText
              : row.template,
          deepLink:
            typeof payload.deepLink === "string" ? payload.deepLink : "",
          chatId:
            payload.chatId != null ? String(payload.chatId) : "",
          attemptId:
            typeof payload.attemptId === "string" ? payload.attemptId : "",
          jobIdVideo:
            typeof payload.jobId === "string" ? payload.jobId : "",
          eventType: row.template,
        };
      });

      return jsonOk(
        {
          kind: body.kind,
          // WF-06 historically checks `notifications`; also expose `jobs`.
          notifications,
          jobs: notifications,
        },
        body.correlationId ?? correlationId,
      );
    }

    if (body.kind === "video_jobs") {
      // WF-02S safety net: queued jobs the webhook fast path never claimed.
      // Read-only; WF-02's jobs/claim does the atomic queued→preparing CAS.
      const jobs = await listStaleQueuedVideoJobs(supabase, { limit });
      return jsonOk(
        { kind: body.kind, jobs },
        body.correlationId ?? correlationId,
      );
    }

    if (body.kind === "reconciliation") {
      const { data: jobs, error } = await supabase
        .from("video_jobs")
        .select("id, owner_id, project_id, status")
        .eq("status", "reconciling")
        .order("updated_at", { ascending: true })
        .limit(limit);

      if (error) {
        throw new AppError(
          ErrorCodes.INTERNAL_ERROR,
          "Failed to claim reconciliation jobs",
          500,
        );
      }

      return jsonOk(
        {
          kind: body.kind,
          jobs: (jobs ?? []).map((job) => ({
            jobId: job.id,
            ownerId: job.owner_id,
            projectId: job.project_id,
            status: job.status,
          })),
        },
        body.correlationId ?? correlationId,
      );
    }

    // ideation / analytics / research — claim due automation_rules rows.
    const ruleKind =
      body.kind === "ideation"
        ? "ideation"
        : body.kind === "analytics"
          ? "analytics"
          : body.kind === "research"
            ? "research"
            : "ideation";

    const { data: rules, error } = await supabase
      .from("automation_rules")
      .select(
        "id, owner_id, project_id, kind, next_due_at, version, timezone, schedule_definition",
      )
      .eq("kind", ruleKind)
      .eq("enabled", true)
      .eq("status", "enabled")
      .lte("next_due_at", now)
      .order("next_due_at", { ascending: true })
      .limit(limit);

    if (error) {
      throw new AppError(
        ErrorCodes.INTERNAL_ERROR,
        "Failed to claim automation rules",
        500,
      );
    }

    const claimed = [];
    for (const rule of rules ?? []) {
      // Soft lease: bump next_due_at +1h so the same rule is not reclaimed immediately.
      const nextDue = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const { data: updated } = await supabase
        .from("automation_rules")
        .update({
          last_run_at: now,
          next_due_at: nextDue,
        })
        .eq("id", rule.id)
        .eq("next_due_at", rule.next_due_at)
        .select("id, owner_id, project_id, kind, next_due_at, version")
        .maybeSingle();

      if (updated) {
        claimed.push({
          jobId: updated.id,
          occurrenceId: updated.id,
          ruleId: updated.id,
          ownerId: updated.owner_id,
          projectId: updated.project_id,
          kind: updated.kind,
          version: updated.version,
          nextDueAt: updated.next_due_at,
        });
      }
    }

    return jsonOk(
      { kind: body.kind, jobs: claimed },
      body.correlationId ?? correlationId,
    );
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
