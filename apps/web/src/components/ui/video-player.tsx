import { Film } from "lucide-react";

const STATE_TEXT: Record<string, string> = {
  queued: "Queued for rendering",
  rendering: "Creating scene images…",
  failed: "Render failed",
  cancelled: "Cancelled",
};

export function VideoBox({ url, status, phase }: { url?: string | null; status?: string | null; phase?: string | null }) {
  if (url) {
    return (
      <div className="video-box">
        <video src={url} controls playsInline preload="metadata" />
      </div>
    );
  }
  return (
    <div className="video-box">
      <Film size={34} className={status === "rendering" || status === "queued" ? "pulse" : ""} />
      <div className="state">
        {status ? (status === "rendering" && phase === "compose" ? "Composing final cut…" : STATE_TEXT[status] ?? status) : "No video yet"}
      </div>
    </div>
  );
}
