import Link from "next/link";
import { describeSchedule } from "@acs/domain";
import { coverClass, pillClass, statusLabel } from "@/lib/format";
import type { ProjectRow } from "@/lib/server/rows";
import type { ProjectSignals } from "@/lib/server/signals";
import { SignalBadges } from "./signal-badges";

export function ProjectCard({ p, signals }: { p: ProjectRow; signals?: ProjectSignals }) {
  return (
    <Link href={`/projects/${p.id}`} className="project-card" style={{ textDecoration: "none" }}>
      <div className={coverClass(p.cover_tone)}><span>{p.emoji || "✳︎"}</span></div>
      <div className="row between"><h3>{p.title}</h3><span className={pillClass(p.status)}>{statusLabel(p.status)}</span></div>
      <p>{p.summary || p.idea}</p>
      <SignalBadges s={signals} status={p.status} timezone={p.schedule?.timezone} compact />
      <div className="project-card-foot"><span>{p.status === "setup" ? "Setup in progress" : describeSchedule(p.schedule)}</span><span className="linklike">Open Project →</span></div>
    </Link>
  );
}
