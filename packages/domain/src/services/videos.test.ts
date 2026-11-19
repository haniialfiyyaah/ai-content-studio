import { describe, expect, it } from "vitest";
import { AppError, ErrorCodes } from "../errors";
import { assertConceptVersionRenderable } from "./videos";

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
