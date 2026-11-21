import { Archive } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";

/** Archive: everything in progress stops (scripts, images, videos, uploads). Unarchive brings it back. */
export function ArchiveButton({ projectId }: { projectId: string }) {
  return (
    <ActionButton
      path={`/api/projects/${projectId}/lifecycle`}
      body={{ action: "archive" }}
      className="btn small ghost"
      title="Archive this project"
      confirm="Archive this project? Everything in progress stops — scripts, images, video renders and scheduled uploads. You can unarchive it later."
    >
      <Archive size={13} /> Archive
    </ActionButton>
  );
}
