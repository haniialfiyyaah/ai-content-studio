"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type LifecycleAction = "activate" | "pause" | "resume" | "stop";

interface LifecycleButton {
  label: string;
  action: LifecycleAction;
  variant: "primary" | "secondary" | "danger" | "ghost";
}

/**
 * Lifecycle controls wired to activate/pause/resume/stop APIs.
 * Activate never implies paid media or publish authorization.
 * Archive remains display-only until an archive API lands.
 */
export function ProjectLifecycleActions({
  projectId,
  status,
  settingsVersion,
}: {
  projectId: string;
  status: string;
  settingsVersion: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<LifecycleAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(settingsVersion);

  const actions = actionsForStatus(status);

  async function runAction(action: LifecycleAction) {
    setPending(action);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: version }),
      });

      const json = (await res.json()) as {
        status: string;
        data?: {
          project?: { settingsVersion?: number };
          settingsVersion?: number;
        } | null;
        error?: { message?: string } | null;
      };

      if (!res.ok || json.status === "error") {
        setError(json.error?.message ?? `Unable to ${action} project`);
        return;
      }

      const nextVersion =
        json.data?.project?.settingsVersion ??
        json.data?.settingsVersion ??
        version + 1;
      setVersion(nextVersion);
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <div className="flex flex-wrap gap-2">
        {actions.map((item) =>
          item.action ? (
            <Button
              key={item.label}
              size="sm"
              variant={item.variant}
              disabled={pending !== null}
              onClick={() => void runAction(item.action)}
            >
              {pending === item.action ? "Working…" : item.label}
            </Button>
          ) : (
            <Button
              key={item.label}
              size="sm"
              variant={item.variant}
              disabled
              title="Coming soon"
            >
              {item.label}
            </Button>
          ),
        )}
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

function actionsForStatus(status: string): Array<
  | LifecycleButton
  | { label: string; action?: undefined; variant: LifecycleButton["variant"] }
> {
  switch (status) {
    case "draft":
      return [
        { label: "Activate", action: "activate", variant: "primary" },
        { label: "Archive", variant: "ghost" },
      ];
    case "active":
      return [
        { label: "Pause", action: "pause", variant: "secondary" },
        { label: "Stop", action: "stop", variant: "danger" },
        { label: "Archive", variant: "ghost" },
      ];
    case "paused":
      return [
        { label: "Resume", action: "resume", variant: "primary" },
        { label: "Stop", action: "stop", variant: "danger" },
        { label: "Archive", variant: "ghost" },
      ];
    case "stopped":
      return [
        { label: "Reactivate", action: "resume", variant: "primary" },
        { label: "Archive", variant: "ghost" },
      ];
    default:
      return [];
  }
}
