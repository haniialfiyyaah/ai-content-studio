import { describe, expect, it } from "vitest";
import { AppError, ErrorCodes } from "./errors";
import { assertInitialLaunchReady } from "./activation";

describe("assertInitialLaunchReady", () => {
  it("rejects empty launch set", () => {
    expect(() => assertInitialLaunchReady([])).toThrow(AppError);
    try {
      assertInitialLaunchReady([]);
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ErrorCodes.INITIAL_LAUNCH_NOT_READY);
    }
  });

  it("requires approved non-revoked working versions", () => {
    expect(() =>
      assertInitialLaunchReady([
        {
          conceptId: "c1",
          selectedForInitialLaunch: true,
          workingVersionId: "v1",
          workingReviewStatus: "draft",
          workingApprovalRevokedAt: null,
          workingVersionBelongsToConcept: true,
        },
      ]),
    ).toThrow(AppError);
  });

  it("returns activation snapshot when ready", () => {
    const snapshot = assertInitialLaunchReady([
      {
        conceptId: "c1",
        selectedForInitialLaunch: true,
        workingVersionId: "v1",
        workingReviewStatus: "approved",
        workingApprovalRevokedAt: null,
        workingVersionBelongsToConcept: true,
      },
      {
        conceptId: "c2",
        selectedForInitialLaunch: false,
        workingVersionId: "v2",
        workingReviewStatus: "draft",
        workingApprovalRevokedAt: null,
        workingVersionBelongsToConcept: true,
      },
    ]);

    expect(snapshot).toEqual([
      { conceptId: "c1", approvedVersionId: "v1" },
    ]);
  });
});
