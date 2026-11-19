"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface PlanningStep {
  sequence: number;
  stage: string | null;
  state: string | null;
  message: string | null;
  createdAt: string;
}

export interface PlanningRun {
  runId: string;
  status: string;
  stage: string | null;
  projectId: string | null;
  events: PlanningStep[];
  /** True when polling gave up while the run was still going. */
  timedOut: boolean;
}

const TERMINAL_STATUSES = new Set(["completed", "failed", "needs_input", "cancelled", "partial"]);
const FAST_POLLS = 10;
const FAST_INTERVAL_MS = 800;
const SLOW_INTERVAL_MS = 2000;
const MAX_WAIT_MS = 120_000;
const MAX_CONSECUTIVE_FAILURES = 5;

export function isRunFinished(run: PlanningRun): boolean {
  return TERMINAL_STATUSES.has(run.status);
}

/**
 * Follows a planning run on GET /api/agent/runs/{id} until it finishes,
 * exposing each recorded step as it lands. Polls quickly at first because
 * in-app planning usually completes in a few seconds; n8n runs take longer.
 */
export function usePlanningRun(): {
  run: PlanningRun | null;
  follow: (runId: string) => Promise<PlanningRun | null>;
  clear: () => void;
} {
  const [run, setRun] = useState<PlanningRun | null>(null);
  const activeRunId = useRef<string | null>(null);

  useEffect(
    () => () => {
      activeRunId.current = null;
    },
    [],
  );

  const follow = useCallback(async (runId: string): Promise<PlanningRun | null> => {
    activeRunId.current = runId;
    setRun({
      runId,
      status: "queued",
      stage: "queued",
      projectId: null,
      events: [],
      timedOut: false,
    });

    const startedAt = Date.now();
    let latest: PlanningRun | null = null;
    let failures = 0;

    for (let poll = 0; Date.now() - startedAt < MAX_WAIT_MS; poll += 1) {
      await delay(poll < FAST_POLLS ? FAST_INTERVAL_MS : SLOW_INTERVAL_MS);
      // A newer message or an unmount took over; stop quietly.
      if (activeRunId.current !== runId) return latest;

      const next = await fetchRun(runId);
      if (!next) {
        failures += 1;
        if (failures >= MAX_CONSECUTIVE_FAILURES) break;
        continue;
      }
      failures = 0;
      latest = next;
      setRun(next);
      if (isRunFinished(next)) return next;
    }

    if (latest && activeRunId.current === runId) {
      const timedOut = { ...latest, timedOut: true };
      setRun(timedOut);
      return timedOut;
    }
    return latest;
  }, []);

  const clear = useCallback(() => {
    activeRunId.current = null;
    setRun(null);
  }, []);

  return { run, follow, clear };
}

async function fetchRun(runId: string): Promise<PlanningRun | null> {
  try {
    const res = await fetch(`/api/agent/runs/${runId}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: Omit<PlanningRun, "timedOut"> | null;
    };
    if (!json.data) return null;
    return { ...json.data, events: json.data.events ?? [], timedOut: false };
  } catch {
    // Transient network failure; the next poll retries.
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
