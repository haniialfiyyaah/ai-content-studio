import { Download, Film, RotateCcw } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";

/** Render / progress / download / retry for one content's latest render. */
export function RenderControls({
  contentId,
  approved,
  render,
}: {
  contentId: string;
  approved: boolean;
  render?: { id: string; status: string; phase?: string | null } | null;
}) {
  if (!approved) return <span className="xs faint">Approve to render</span>;
  if (!render || render.status === "cancelled") {
    return <ActionButton path={`/api/contents/${contentId}/actions`} body={{ action: "render" }} className="btn small soft"><Film size={13} /> Render video</ActionButton>;
  }
  if (render.status === "ready") {
    return (
      <span className="actions">
        <a className="btn small primary" href={`/api/renders/${render.id}/download`}><Download size={13} /> Download</a>
        <ActionButton path={`/api/contents/${contentId}/actions`} body={{ action: "render" }} className="btn small ghost" title="Render a new version"><RotateCcw size={13} /></ActionButton>
      </span>
    );
  }
  if (render.status === "failed") {
    return <ActionButton path={`/api/renders/${render.id}/retry`} className="btn small soft"><RotateCcw size={13} /> Retry</ActionButton>;
  }
  return <span className="pill blue pulse">{render.phase === "compose" ? "Composing…" : render.status === "queued" ? "Queued…" : "Creating scenes…"}</span>;
}
