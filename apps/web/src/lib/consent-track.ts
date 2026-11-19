/**
 * Consent track: the four independent decisions a concept passes through on its
 * way to an audience. Each gate is derived from persisted state only, so the UI
 * never shows progress the database cannot back up.
 */

export type GateId = "concept" | "spend" | "video" | "publish";

/**
 * - done: the creator decided (or the system finished) and nothing is owed.
 * - current: waiting on the creator right now.
 * - working: the agent or a workflow is doing the work.
 * - blocked: something failed and needs the creator's attention.
 * - todo: not reachable until an earlier gate is done.
 */
export type GateState = "done" | "current" | "working" | "blocked" | "todo";

export interface ConsentGate {
  id: GateId;
  label: string;
  state: GateState;
  detail: string;
}

export interface NextAction {
  label: string;
  href: string;
  /** Spend authorization is granted inline instead of navigating away. */
  kind: "link" | "authorize_spend";
}

export interface ConsentTrack {
  gates: ConsentGate[];
  next: NextAction | null;
  /** Who the track is waiting on, used to sort the decision queue. */
  waitingOn: "creator" | "agent" | "nobody";
}

export interface ConsentInputs {
  conceptId: string;
  /** Review status of the working version; null when the agent has not drafted one. */
  workingReviewStatus: string | null;
  /** True when a non-revoked approved version exists. */
  conceptApproved: boolean;
  spendAuthorized: boolean;
  video: {
    attemptId: string;
    status: string;
    approved: boolean;
  } | null;
  publish: {
    status: string;
    scheduledFor: string | null;
  } | null;
}

const VIDEO_WORKING = new Set([
  "queued",
  "preparing",
  "generating",
  "rendering",
  "validating",
  "reconciling",
  "cancel_requested",
]);

const VIDEO_BLOCKED = new Set(["failed", "blocked", "cancelled"]);

const PUBLISH_WORKING = new Set(["scheduled", "publishing", "reconciling"]);

const PUBLISH_BLOCKED = new Set(["failed", "blocked", "held", "cancelled"]);

export function deriveConsentTrack(input: ConsentInputs): ConsentTrack {
  const contentHref = (tab: string) => `/content/${input.conceptId}?tab=${tab}`;

  const concept: ConsentGate = input.conceptApproved
    ? { id: "concept", label: "Concept", state: "done", detail: "Approved" }
    : input.workingReviewStatus
      ? { id: "concept", label: "Concept", state: "current", detail: "Needs review" }
      : { id: "concept", label: "Concept", state: "working", detail: "Agent drafting" };

  const spend: ConsentGate =
    concept.state !== "done"
      ? { id: "spend", label: "Spend", state: "todo", detail: "After approval" }
      : input.spendAuthorized
        ? { id: "spend", label: "Spend", state: "done", detail: "Authorized" }
        : { id: "spend", label: "Spend", state: "current", detail: "Authorize spend" };

  const video = deriveVideoGate(input, spend.state === "done");
  const publish = derivePublishGate(input, video.state === "done");
  const gates = [concept, spend, video, publish];

  const pending = gates.find(
    (gate) => gate.state === "current" || gate.state === "blocked",
  );

  if (pending) {
    return {
      gates,
      next: nextActionFor(pending, input, contentHref),
      waitingOn: "creator",
    };
  }

  const working = gates.find((gate) => gate.state === "working");
  if (working) {
    return {
      gates,
      next: {
        label: working.id === "publish" ? "View schedule" : "Open production",
        href: working.id === "publish" ? "/publishing" : contentHref("production"),
        kind: "link",
      },
      waitingOn: "agent",
    };
  }

  return { gates, next: null, waitingOn: "nobody" };
}

function deriveVideoGate(input: ConsentInputs, reachable: boolean): ConsentGate {
  if (!reachable) {
    return { id: "video", label: "Video", state: "todo", detail: "After spend" };
  }
  if (!input.video) {
    return { id: "video", label: "Video", state: "current", detail: "Start production" };
  }
  if (input.video.approved) {
    return { id: "video", label: "Video", state: "done", detail: "Approved" };
  }
  if (input.video.status === "ready_for_review") {
    return { id: "video", label: "Video", state: "current", detail: "Ready for review" };
  }
  if (VIDEO_BLOCKED.has(input.video.status)) {
    return {
      id: "video",
      label: "Video",
      state: "blocked",
      detail: input.video.status === "failed" ? "Render failed" : "Render stopped",
    };
  }
  if (VIDEO_WORKING.has(input.video.status)) {
    return { id: "video", label: "Video", state: "working", detail: "Rendering" };
  }
  return { id: "video", label: "Video", state: "working", detail: humanize(input.video.status) };
}

function derivePublishGate(input: ConsentInputs, reachable: boolean): ConsentGate {
  if (!reachable) {
    return { id: "publish", label: "Publish", state: "todo", detail: "After video" };
  }
  if (!input.publish) {
    return { id: "publish", label: "Publish", state: "current", detail: "Not scheduled" };
  }
  if (input.publish.status === "published") {
    return { id: "publish", label: "Publish", state: "done", detail: "Published" };
  }
  if (PUBLISH_BLOCKED.has(input.publish.status)) {
    return { id: "publish", label: "Publish", state: "blocked", detail: humanize(input.publish.status) };
  }
  if (PUBLISH_WORKING.has(input.publish.status)) {
    return {
      id: "publish",
      label: "Publish",
      state: "working",
      detail: input.publish.scheduledFor
        ? `Scheduled ${formatShortDate(input.publish.scheduledFor)}`
        : "Scheduled",
    };
  }
  return { id: "publish", label: "Publish", state: "current", detail: "Needs destination" };
}

function nextActionFor(
  gate: ConsentGate,
  input: ConsentInputs,
  contentHref: (tab: string) => string,
): NextAction {
  switch (gate.id) {
    case "concept":
      return { label: "Review concept", href: contentHref("overview"), kind: "link" };
    case "spend":
      return { label: "Authorize spend", href: contentHref("production"), kind: "authorize_spend" };
    case "video":
      if (gate.state === "current" && input.video) {
        return { label: "Review video", href: `/videos/${input.video.attemptId}`, kind: "link" };
      }
      return {
        label: gate.state === "blocked" ? "Fix production" : "Start production",
        href: contentHref("production"),
        kind: "link",
      };
    case "publish":
      return { label: "Schedule post", href: "/publishing/schedule", kind: "link" };
  }
}

function humanize(value: string): string {
  const text = value.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
