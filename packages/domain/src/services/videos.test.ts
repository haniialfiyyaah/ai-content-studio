import { describe, expect, it } from "vitest";
import { AppError, ErrorCodes } from "../errors";
import {
  assertConceptVersionRenderable,
  completeVideoJob,
  failVideoJob,
  listStaleQueuedVideoJobs,
} from "./videos";

/** Minimal chainable fake matching the subset of the Supabase client used here. */
function fakeSupabase(options: {
  job: Record<string, unknown>;
  attempt: Record<string, unknown>;
}) {
  const inserted: Array<{ table: string; row: unknown }> = [];

  function chain(terminalData: unknown, table?: string) {
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      limit: () => builder,
      is: () => builder,
      in: () => builder,
      update: (patch: Record<string, unknown>) => {
        Object.assign(terminalData as Record<string, unknown>, patch);
        return builder;
      },
      insert: (row: unknown) => {
        inserted.push({ table: table ?? "", row });
        return Promise.resolve({ data: null, error: null });
      },
      maybeSingle: () => Promise.resolve({ data: terminalData, error: null }),
      single: () => Promise.resolve({ data: terminalData, error: null }),
    };
    return builder;
  }

  const supabase = {
    from: (table: string) => {
      if (table === "video_jobs") return chain(options.job, table);
      if (table === "video_attempts") return chain(options.attempt, table);
      if (table === "telegram_links") return chain(null, table);
      return chain(null, table);
    },
    _inserted: inserted,
  };
  return supabase;
}

describe("assertConceptVersionRenderable", () => {
  it("allows approved non-revoked versions", () => {
    expect(() =>
      assertConceptVersionRenderable({
        reviewStatus: "approved",
        approvalRevokedAt: null,
      }),
    ).not.toThrow();
  });

  it("rejects draft and pending_review versions", () => {
    for (const reviewStatus of ["draft", "pending_review"] as const) {
      try {
        assertConceptVersionRenderable({
          reviewStatus,
          approvalRevokedAt: null,
        });
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe(ErrorCodes.CONCEPT_NOT_APPROVED);
      }
    }
  });

  it("rejects revoked approvals even when status is approved", () => {
    try {
      assertConceptVersionRenderable({
        reviewStatus: "approved",
        approvalRevokedAt: "2026-11-19T00:00:00.000Z",
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ErrorCodes.CONCEPT_NOT_APPROVED);
      expect((error as AppError).status).toBe(409);
    }
  });
});

describe("completeVideoJob", () => {
  for (const productionMode of ["remotion", "fal", "hybrid"] as const) {
    it(`refuses to complete ${productionMode} without a verified outputAssetId`, async () => {
      const supabase = fakeSupabase({
        job: { id: "job-1", production_mode: productionMode, status: "rendering" },
        attempt: {
          id: "attempt-1",
          video_job_id: "job-1",
          status: "rendering",
          output_asset_id: null,
        },
      });

      await expect(
        completeVideoJob(supabase as never, { jobId: "job-1" }),
      ).rejects.toMatchObject({
        code: ErrorCodes.VALIDATION_ERROR,
        status: 409,
      });
    });
  }

  it("completes fal once a real outputAssetId is supplied", async () => {
    const supabase = fakeSupabase({
      job: { id: "job-2", production_mode: "fal", status: "rendering" },
      attempt: {
        id: "attempt-2",
        video_job_id: "job-2",
        status: "rendering",
        output_asset_id: null,
      },
    });

    const result = await completeVideoJob(supabase as never, {
      jobId: "job-2",
      outputAssetId: "asset-123",
    });

    expect(result.job.status).toBe("ready_for_review");
    expect(result.attempt.status).toBe("ready_for_review");
  });
});

describe("failVideoJob", () => {
  for (const status of ["ready_for_review", "cancelled", "failed"]) {
    it(`refuses to overwrite a ${status} job (duplicate/late worker)`, async () => {
      const supabase = fakeSupabase({
        job: { id: "job-3", production_mode: "fal", status },
        attempt: { id: "attempt-3", video_job_id: "job-3", status },
      });

      await expect(
        failVideoJob(supabase as never, { jobId: "job-3", category: "AUTHZ" }),
      ).rejects.toMatchObject({ code: ErrorCodes.VALIDATION_ERROR, status: 409 });
    });
  }

  it("fails an in-flight job", async () => {
    const supabase = fakeSupabase({
      job: { id: "job-4", production_mode: "fal", status: "rendering" },
      attempt: { id: "attempt-4", video_job_id: "job-4", status: "rendering" },
    });

    const result = await failVideoJob(supabase as never, {
      jobId: "job-4",
      category: "FAL_POLL_TIMEOUT",
    });

    expect(result.job.status).toBe("failed");
    expect(result.attempt.status).toBe("failed");
  });
});

describe("listStaleQueuedVideoJobs", () => {
  function recordingSupabase(rows: unknown[]) {
    const calls: Array<[string, ...unknown[]]> = [];
    const builder: any = {};
    for (const m of ["select", "eq", "lte", "gte", "order"]) {
      builder[m] = (...args: unknown[]) => {
        calls.push([m, ...args]);
        return builder;
      };
    }
    builder.limit = (n: number) => {
      calls.push(["limit", n]);
      return Promise.resolve({ data: rows, error: null });
    };
    return { supabase: { from: () => builder }, calls };
  }

  it("selects only queued jobs inside the grace/max-age window", async () => {
    const now = new Date("2026-11-20T12:00:00.000Z");
    const { supabase, calls } = recordingSupabase([
      {
        id: "job-5",
        project_id: "p-1",
        concept_version_id: "cv-1",
        production_mode: "fal",
        consent_id: null,
        idempotency_key: "k-1",
        updated_at: "2026-11-20T11:50:00.000Z",
      },
    ]);

    const jobs = await listStaleQueuedVideoJobs(supabase as never, {
      now,
      limit: 5,
    });

    expect(calls).toContainEqual(["eq", "status", "queued"]);
    expect(calls).toContainEqual(["lte", "updated_at", "2026-11-20T11:58:00.000Z"]);
    expect(calls).toContainEqual(["gte", "updated_at", "2026-11-19T12:00:00.000Z"]);
    expect(calls).toContainEqual(["limit", 5]);
    expect(jobs).toEqual([
      {
        jobId: "job-5",
        projectId: "p-1",
        conceptVersionId: "cv-1",
        productionMode: "fal",
        consentId: null,
        idempotencyKey: "k-1",
        queuedAt: "2026-11-20T11:50:00.000Z",
      },
    ]);
  });
});
