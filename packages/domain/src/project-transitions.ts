import { AppError, ErrorCodes, type ProjectStatus } from "@acs/schemas";

/**
 * Project lifecycle transitions (TDD §5).
 * Activate never implies paid media or publish authorization.
 */
const ALLOWED: Record<ProjectStatus, readonly ProjectStatus[]> = {
  draft: ["active", "archived"],
  active: ["paused", "stopped", "archived"],
  paused: ["active", "stopped", "archived"],
  stopped: ["active", "archived"],
  archived: [],
};

export function assertProjectTransition(
  from: ProjectStatus,
  to: ProjectStatus,
): void {
  if (!ALLOWED[from].includes(to)) {
    throw new AppError(
      ErrorCodes.PROJECT_NOT_ACTIONABLE,
      `Cannot transition project from ${from} to ${to}`,
      409,
    );
  }
}

export function isAutomationEligible(status: ProjectStatus): boolean {
  return status === "active";
}
