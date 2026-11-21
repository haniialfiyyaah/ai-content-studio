export function fmtDateTime(iso: string | null | undefined, tz = "Asia/Jakarta"): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function fmtDate(iso: string | null | undefined, tz = "Asia/Jakarta"): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}

export function timeAgo(iso: string): string {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const PILL: Record<string, string> = {
  setup: "draft",
  draft: "draft",
  live: "active",
  paused: "paused",
  stopped: "stopped",
  failed: "paused",
  idea: "pending",
  approved: "approved",
  removed: "off",
  queued: "pending",
  rendering: "blue",
  ready: "approved",
  cancelled: "off",
  scheduled: "blue",
  publishing: "pending",
  published: "approved",
};
export const pillClass = (status: string) => `pill ${PILL[status] ?? ""}`;

export const statusLabel = (status: string) =>
  ({ draft: "Draft", generating: "Generating", setup: "Setting up", live: "Live" }[status] ?? status.charAt(0).toUpperCase() + status.slice(1));

export const COVER_TONES = ["peach", "lavender", "dark", "mint"] as const;
export const coverClass = (tone: number) => `project-cover ${COVER_TONES[tone % 4]}`;
