"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "@/lib/client/api";

/**
 * A small Auto switch next to a continue button. autoApprove = the agent keeps
 * going through the setup / concept steps; autoVideo = videos start by
 * themselves once every storyboard is done.
 */
export function InlineAuto({
  projectId,
  field,
  initial,
  label = "Auto",
  hint,
}: {
  projectId: string;
  field: "autoApprove" | "autoVideo";
  initial: boolean;
  label?: string;
  hint: string;
}) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <label className="inline-auto" title={hint}>
      <span className={`xs semibold ${on ? "on" : ""}`}>⚡ {label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={`toggle small ${on ? "on" : ""}`}
        disabled={pending}
        onClick={() => {
          const next = !on;
          setOn(next);
          start(async () => {
            try {
              await api(`/api/projects/${projectId}/settings`, "PATCH", { [field]: next });
              router.refresh();
            } catch {
              setOn(!next);
            }
          });
        }}
      />
    </label>
  );
}
