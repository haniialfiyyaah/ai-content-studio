"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Play, Square } from "lucide-react";
import { api } from "@/lib/client/api";
import { Spinner } from "@/components/ui/spinner";

/** Stop everything the agent is making for this project — then Continue picks up what was left. */
export function GenerationControl({ projectId, working, halted }: { projectId: string; working: boolean; halted: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!working && !halted) return null;
  const run = (action: "stop" | "resume") =>
    start(async () => {
      await api(`/api/projects/${projectId}/setup`, "POST", { action }).catch(() => undefined);
      router.refresh();
    });
  return halted ? (
    <button className="btn small primary" disabled={pending} onClick={() => run("resume")}>
      {pending ? <Spinner size={12} /> : <Play size={12} />} Continue generating
    </button>
  ) : (
    <button className="btn small gen-stop" disabled={pending} onClick={() => run("stop")} title="Stop everything being generated now">
      {pending ? <Spinner size={12} /> : <Square size={11} />} Stop
    </button>
  );
}
