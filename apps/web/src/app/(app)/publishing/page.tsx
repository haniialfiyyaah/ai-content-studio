import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarDays } from "lucide-react";
import { resolveContent } from "@acs/domain";
import { PageHead } from "@/components/ui/empty";
import { LiveRefresh } from "@/components/ui/live-refresh";
import { fmtDateTime, pillClass, statusLabel } from "@/lib/format";
import type { PublishJobRow } from "@/lib/server/rows";
import { requireUser } from "@/lib/server/session";

type Job = PublishJobRow & { contents: { options: never; selection: never } | null; projects: { title: string } | null };

function ymd(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export default async function PublishingPage({ searchParams }: { searchParams: Promise<{ month?: string; day?: string }> }) {
  const { month, day } = await searchParams;
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  const tz = profile?.timezone ?? "Asia/Jakarta";
  const today = ymd(new Date(), tz);
  const [y, m] = (month && /^\d{4}-\d{2}$/.test(month) ? month : today.slice(0, 7)).split("-").map(Number);

  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const gridStart = new Date(Date.UTC(y, m - 1, 1 - lead));
  const cells = Array.from({ length: 42 }, (_, i) => new Date(gridStart.getTime() + i * 86_400_000));
  const from = new Date(gridStart.getTime() - 86_400_000).toISOString();
  const to = new Date(gridStart.getTime() + 43 * 86_400_000).toISOString();

  const [{ data: jobs }, { data: yt }, { count: ready }] = await Promise.all([
    supabase.from("publish_jobs").select("*, contents(options, selection), projects(title)").gte("scheduled_for", from).lt("scheduled_for", to).neq("status", "cancelled").order("scheduled_for"),
    supabase.from("connected_accounts").select("display_name, status").eq("platform", "youtube").maybeSingle(),
    supabase.from("video_renders").select("id", { count: "exact", head: true }).eq("status", "ready"),
  ]);
  const list = (jobs ?? []) as Job[];
  const byDay = new Map<string, Job[]>();
  for (const j of list) {
    const k = ymd(new Date(j.scheduled_for), tz);
    byDay.set(k, [...(byDay.get(k) ?? []), j]);
  }
  const { data: upcoming } = await supabase
    .from("publish_jobs")
    .select("*, contents(options, selection), projects(title)")
    .in("status", ["scheduled", "publishing", "failed"])
    .order("scheduled_for")
    .limit(12);
  const queue = (day ? byDay.get(day) ?? [] : (upcoming ?? [])) as Job[];
  const monthKey = (dy: number, dm: number) => {
    const d = new Date(Date.UTC(dy, dm - 1, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const title = (j: Job) => resolveContent(j.contents?.options, j.contents?.selection).title;

  return (
    <main className="page">
      <LiveRefresh sources={[{ table: "publish_jobs" }]} />
      <PageHead eyebrow="DISTRIBUTION" title="Publishing" text="Your YouTube publishing calendar. Uploads happen automatically at each slot once the video is rendered." />
      <div className="manage-metrics">
        <div className="manage-metric"><span className="xs muted">Scheduled</span><strong>{list.filter((j) => j.status === "scheduled").length}</strong><small>Upcoming this view</small></div>
        <div className="manage-metric"><span className="xs muted">Published</span><strong>{list.filter((j) => j.status === "published").length}</strong><small>This view</small></div>
        <div className="manage-metric"><span className="xs muted">Videos ready</span><strong>{ready ?? 0}</strong><small>Rendered and waiting</small></div>
        <div className="manage-metric"><span className="xs muted">Connected channels</span><strong>{yt?.status === "connected" ? 1 : 0}</strong><small>{yt?.display_name ?? "YouTube not connected"}</small></div>
      </div>

      <div className="card pad">
        <div className="calendar-head">
          <div><h2 style={{ fontSize: 20 }}>Publishing calendar</h2><p className="xs muted">Select a day to inspect its scheduled posts.</p></div>
          <div className="actions">
            <Link className="icbtn" href={`/publishing?month=${monthKey(y, m - 1)}`} aria-label="Previous month"><ArrowLeft size={15} /></Link>
            <span className="pill">{new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(first)}</span>
            <Link className="icbtn" href={`/publishing?month=${monthKey(y, m + 1)}`} aria-label="Next month"><ArrowRight size={15} /></Link>
            <Link className="btn ghost small" href="/publishing">Today</Link>
          </div>
        </div>
        <div className="calgrid">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="caldayhead">{d}</div>)}
          {cells.map((d) => {
            const k = d.toISOString().slice(0, 10);
            const items = byDay.get(k) ?? [];
            const outside = d.getUTCMonth() !== m - 1;
            return (
              <Link key={k} href={`/publishing?month=${monthKey(y, m)}&day=${k}`} className={`calday ${outside ? "outside" : ""} ${k === today || k === day ? "current" : ""}`} style={{ textDecoration: "none" }}>
                <span className="date-number">{d.getUTCDate()}</span>
                {items.slice(0, 3).map((j) => (
                  <span key={j.id} className={`calitem ${j.status === "published" ? "published" : j.status === "failed" ? "held" : ""}`} style={{ display: "block" }}>
                    {new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(j.scheduled_for))} · {title(j)}
                  </span>
                ))}
                {items.length > 3 && <span className="tiny faint">+{items.length - 3} more</span>}
              </Link>
            );
          })}
        </div>
        <div className="calendar-foot">
          <span><i className="callegend" />Scheduled</span>
          <span><i className="callegend" style={{ background: "#ffd9a8" }} />Failed</span>
          <span><i className="callegend" style={{ background: "#bfe9d3" }} />Published</span>
          <span>Timezone: {tz}</span>
        </div>
      </div>

      <div className="management-grid" style={{ marginTop: 18 }}>
        <div className="card pad">
          <div className="section"><div><h2>{day ? `Posts on ${day}` : "Publishing queue"}</h2><p>Each upload is tied to an approved content and its rendered video.</p></div></div>
          {queue.map((j) => (
            <Link key={j.id} href={`/projects/${j.project_id}/content/${j.content_id}`} className="listrow rowclick" style={{ textDecoration: "none" }}>
              <div className="row">
                <span className="iconTile"><CalendarDays size={15} /></span>
                <div><div className="small semibold">{title(j)}</div><div className="xs muted">{j.projects?.title} · YouTube Shorts · {fmtDateTime(j.scheduled_for, tz)}</div></div>
              </div>
              <span className={pillClass(j.status)}>{statusLabel(j.status)}</span>
            </Link>
          ))}
          {!queue.length && <p className="small muted">Nothing scheduled{day ? " on this day" : ""}.</p>}
        </div>
        <div className="card pad">
          <div className="section"><h2>Publishing connections</h2><Link href="/settings?section=connections" className="linklike">Manage →</Link></div>
          <div className="listrow">
            <div><div className="small semibold">YouTube Shorts</div><div className="xs muted">{yt?.display_name ?? "Not connected"}</div></div>
            {yt?.status === "connected" ? <span className="pill approved">Connected</span> : <Link href="/settings?section=connections" className="btn small soft">Connect</Link>}
          </div>
          <div className="listrow"><div><div className="small semibold">Instagram Reels</div><div className="xs muted">Not available yet</div></div><span className="pill off">Soon</span></div>
          <div className="listrow"><div><div className="small semibold">TikTok</div><div className="xs muted">Not available yet</div></div><span className="pill off">Soon</span></div>
          <div className="note" style={{ marginTop: 12 }}>Uploads only happen for approved content in active projects. Pausing a project holds its uploads.</div>
        </div>
      </div>
    </main>
  );
}
