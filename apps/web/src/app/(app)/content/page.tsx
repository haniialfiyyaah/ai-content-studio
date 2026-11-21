import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { resolveContent } from "@acs/domain";
import { EmptyState, PageHead } from "@/components/ui/empty";
import { LiveRefresh } from "@/components/ui/live-refresh";
import { fmtDateTime, pillClass } from "@/lib/format";
import type { ContentRow } from "@/lib/server/rows";
import { requireUser } from "@/lib/server/session";

export default async function ContentLibrary({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const { supabase } = await requireUser();
  let q = supabase.from("contents").select("*, projects(title)").neq("status", "removed").order("created_at", { ascending: false }).limit(200);
  if (status === "idea" || status === "approved") q = q.eq("status", status);
  const { data } = await q;
  const rows = (data ?? []) as (ContentRow & { projects: { title: string } | null })[];

  return (
    <main className="page">
      <LiveRefresh sources={[{ table: "contents" }]} />
      <PageHead eyebrow="WORKSPACE" title="Content" text="All generated content across your projects." />
      <div className="asset-filters">
        {[["", "All"], ["idea", "Needs review"], ["approved", "Approved"]].map(([k, l]) => (
          <Link key={k} href={k ? `/content?status=${k}` : "/content"} className={`asset-filter ${(status ?? "") === k ? "active" : ""}`}>{l}</Link>
        ))}
      </div>
      {rows.length ? (
        <div className="card pad">
          {rows.map((c) => (
            <Link key={c.id} href={`/projects/${c.project_id}/content/${c.id}`} className="listrow rowclick" style={{ textDecoration: "none" }}>
              <div>
                <div className="small semibold">{resolveContent(c.options, c.selection).title}</div>
                <div className="xs muted">{c.projects?.title} · {c.scenes.length} scenes · {c.scheduled_for ? fmtDateTime(c.scheduled_for) : "unscheduled"}</div>
              </div>
              <div className="row"><span className={pillClass(c.status)}>{c.status === "approved" ? "Approved" : "Pending"}</span><span className="icbtn"><ArrowRight size={14} /></span></div>
            </Link>
          ))}
        </div>
      ) : <EmptyState title="No content yet" text="Content appears here as soon as the agent generates it." />}
    </main>
  );
}
