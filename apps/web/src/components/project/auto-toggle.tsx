"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "@/lib/client/api";

/** Auto: the agent runs the project setup through without stopping (default off). */
export function AutoToggle({ projectId, initial, disabled }: { projectId: string; initial: boolean; disabled?: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <div className="setting-line auto-toggle">
      <div>
        <div className="small semibold">⚡ Auto</div>
        <div className="xs muted">Off: I stop after each step so you can check it. On: I go through concept, kit and pillars by myself — you still see every step.</div>
      </div>
      <button
        className={`toggle ${on ? "on" : ""}`}
        role="switch"
        aria-checked={on}
        aria-label="Auto"
        disabled={disabled || pending}
        onClick={() => {
          const next = !on;
          setOn(next);
          start(async () => {
            try {
              await api(`/api/projects/${projectId}/settings`, "PATCH", { autoApprove: next });
              router.refresh();
            } catch {
              setOn(!next);
            }
          });
        }}
      />
    </div>
  );
}
