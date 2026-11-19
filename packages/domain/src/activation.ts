import { AppError, ErrorCodes } from "@acs/schemas";

export interface LaunchConceptCheck {
  conceptId: string;
  selectedForInitialLaunch: boolean;
  workingVersionId: string | null;
  workingReviewStatus: string | null;
  workingApprovalRevokedAt: string | null;
  workingVersionBelongsToConcept: boolean;
}

/**
 * First-activation gate (TDD §5.3 / invariant 11).
 * Requires nonempty selected launch set where each working version
 * is approved, non-revoked, and belongs to that concept.
 */
export function assertInitialLaunchReady(
  concepts: LaunchConceptCheck[],
): { conceptId: string; approvedVersionId: string }[] {
  const selected = concepts.filter((c) => c.selectedForInitialLaunch);

  if (selected.length === 0) {
    throw new AppError(
      ErrorCodes.INITIAL_LAUNCH_NOT_READY,
      "Select at least one approved concept for initial launch before activating",
      409,
      { missing: "empty_launch_set" },
    );
  }

  const snapshot: { conceptId: string; approvedVersionId: string }[] = [];
  const blockers: Array<{ conceptId: string; reason: string }> = [];

  for (const concept of selected) {
    if (!concept.workingVersionId) {
      blockers.push({ conceptId: concept.conceptId, reason: "no_working_version" });
      continue;
    }
    if (!concept.workingVersionBelongsToConcept) {
      blockers.push({ conceptId: concept.conceptId, reason: "version_mismatch" });
      continue;
    }
    if (concept.workingReviewStatus !== "approved") {
      blockers.push({ conceptId: concept.conceptId, reason: "not_approved" });
      continue;
    }
    if (concept.workingApprovalRevokedAt) {
      blockers.push({ conceptId: concept.conceptId, reason: "approval_revoked" });
      continue;
    }
    snapshot.push({
      conceptId: concept.conceptId,
      approvedVersionId: concept.workingVersionId,
    });
  }

  if (blockers.length > 0) {
    throw new AppError(
      ErrorCodes.INITIAL_LAUNCH_NOT_READY,
      "Initial launch concepts are not ready for activation",
      409,
      { blockers },
    );
  }

  return snapshot;
}
