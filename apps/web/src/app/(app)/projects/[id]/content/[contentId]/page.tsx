import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import { OPTION_FIELDS, resolveContent } from "@acs/domain";
import { OptionPicker } from "@/components/content/option-picker";
import { RenderControls } from "@/components/content/render-controls";
import { ActionButton } from "@/components/ui/action-button";
import { LiveRefresh } from "@/components/ui/live-refresh";
import { VideoBox } from "@/components/ui/video-player";
import { fmtDateTime, pillClass } from "@/lib/format";
import { latestRenders } from "@/lib/server/queries";
import type { ContentRow, ProjectRow } from "@/lib/server/rows";
import { requireUser } from "@/lib/server/session";

const TONES = ["", "blue", "dark"];
const TABS = [
  ["overview", "Overview"],
  ["script", "Script & Narration"],
  ["storyboard", "Storyboard & Scenes"],
  ["publishing", "Publishing Pack"],
  ["video", "Video"],
] as const;

export default async function ContentDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; contentId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id, contentId }, { tab = "overview" }] = await Promise.all([params, searchParams]);
  const { supabase } = await requireUser();
  const [{ data: project }, { data: content }, { data: job }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).maybeSingle(),
    supabase.from("contents").select("*").eq("id", contentId).eq("project_id", id).maybeSingle(),
    supabase.from("publish_jobs").select("*").eq("content_id", contentId).maybeSingle(),
  ]);
  if (!project || !content) notFound();
  const p = project as ProjectRow;
  const c = content as ContentRow;
  const picked = resolveContent(c.options, c.selection);
  const render = (await latestRenders(supabase, [c.id])).get(c.id);
  const editable = p.status !== "stopped";
  const base = `/projects/${p.id}/content/${c.id}`;
  const total = c.scenes.reduce((s, x) => s + (x.seconds || 5), 0);

  return (
    <main className="page">
      <LiveRefresh sources={[{ table: "contents", filter: `id=eq.${c.id}` }, { table: "video_renders", filter: `content_id=eq.${c.id}` }]} />
      <div className="row xs muted" style={{ marginBottom: 18 }}>
        <Link href={`/projects/${p.id}?tab=content`} className="row semibold" style={{ color: "var(--text)", textDecoration: "none" }}><ArrowLeft size={15} /> {p.title}</Link>
        <span>/ Content / {picked.title}</span>
      </div>
      <div className="detailhead">
        <div>
          <div className="eyebrow">CONTENT DETAIL</div>
          <div className="row" style={{ flexWrap: "wrap" }}><h1>{picked.title}</h1><span className={pillClass(c.status)}>{c.status === "approved" ? "Approved" : "Pending"}</span></div>
          <p>{picked.hook}</p>
          <div className="tagrow">
            <span className="badge-outline">{p.title}</span>
            <span className="badge-outline">{c.scenes.length} scenes</span>
            <span className="badge-outline">{p.creative_kit?.language ?? "English"}</span>
            <span className="badge-outline">{c.scheduled_for ? fmtDateTime(c.scheduled_for, p.schedule.timezone) : "Not scheduled"}</span>
          </div>
        </div>
        {c.status === "draft" && editable && (
          <ActionButton path={`/api/projects/${p.id}/approve-all`} className="btn primary"><Check size={14} /> Approve all content</ActionButton>
        )}
      </div>
      <div className="note" style={{ margin: "20px 0" }}>
        Every field below was generated with alternatives — choose with the dropdowns. Approval makes this content eligible for automatic rendering and publishing once the project is active.
      </div>
      <nav className="tabs">
        {TABS.map(([k, l]) => <Link key={k} href={`${base}?tab=${k}`} scroll={false} className={`tab ${tab === k ? "active" : ""}`}>{l}</Link>)}
      </nav>

      {tab === "overview" && (
        <div className="grid g2">
          <div className="card pad">
            <div className="section"><h2>Choose your options</h2></div>
            {OPTION_FIELDS.filter((f) => f !== "script").map((f) => (
              <OptionPicker key={f} contentId={c.id} field={f} options={c.options[f] ?? []} selected={c.selection[f] ?? 0} disabled={!editable} preview />
            ))}
          </div>
          <div className="card pad">
            <div className="section"><h2>Summary</h2></div>
            <div className="kv"><label>Duration</label><strong>9:16 · ~{total}s</strong></div>
            <div className="kv"><label>Scheduled</label><strong>{fmtDateTime(job?.scheduled_for ?? c.scheduled_for, p.schedule.timezone)}</strong></div>
            <div className="kv"><label>Video</label><span className={pillClass(render?.status ?? "draft")}>{render?.status ?? "Not rendered"}</span></div>
            <div className="kv"><label>YouTube</label>{job?.external_url ? <a className="linklike" href={job.external_url} target="_blank" rel="noreferrer">Open →</a> : <strong>{job?.status ?? "—"}</strong>}</div>
            <div className="divider" />
            <div className="eyebrow">VIDEO DIRECTION</div>
            <p className="small muted line">{c.video_prompt}</p>
          </div>
        </div>
      )}

      {tab === "script" && (
        <div className="card pad">
          <OptionPicker contentId={c.id} field="script" options={c.options.script ?? []} selected={c.selection.script ?? 0} disabled={!editable} preview />
          <div className="divider" />
          <div className="section"><h2>Scene narration</h2></div>
          {c.scenes.map((s, i) => (
            <div key={i} className="script-row"><div className="script-time">Scene {i + 1}<br />{s.seconds}s</div><div className="script-line">{s.narration || "—"}</div></div>
          ))}
        </div>
      )}

      {tab === "storyboard" && (
        <div className="stack">
          <div className="section"><div><h2>Storyboard & scene direction</h2><p>Each scene becomes its own AI clip; clips are composed into the final Short.</p></div><span className="badge-outline">9:16 · {total} seconds</span></div>
          {c.scenes.map((s, i) => {
            const from = c.scenes.slice(0, i).reduce((a, x) => a + (x.seconds || 5), 0);
            return (
              <div key={i} className="scene-card">
                <div className={`scene-visual ${TONES[i % 3]}`}><span className="ring" /><span className="bigemoji">{["🎬", "✨", "🌿", "📦", "💡", "🎯"][i % 6]}</span><span className="labelstrip">{s.onScreenText || s.heading}</span></div>
                <div className="scene-body">
                  <div className="row between"><div className="eyebrow" style={{ margin: 0 }}>SCENE {String(i + 1).padStart(2, "0")}</div><span className="pill">{from}–{from + (s.seconds || 5)}s</span></div>
                  <h3>{s.heading}</h3>
                  <p className="scene-text">{s.narration}</p>
                  <div className="divider" />
                  <div className="grid g2">
                    <div><div className="xs muted">Visuals</div><div className="small semibold">{s.visual || "—"}</div></div>
                    <div><div className="xs muted">Motion & transitions</div><div className="small semibold">{s.motion || "—"}</div></div>
                  </div>
                  {s.onScreenText && <div className="tagrow"><span className="tag">On-screen text: {s.onScreenText}</span><span className="tag">Narration aligned</span></div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "publishing" && (
        <div className="card pad">
          <div className="section"><div><h2>Publishing pack</h2><p>What gets uploaded to YouTube.</p></div></div>
          <OptionPicker contentId={c.id} field="title" options={c.options.title ?? []} selected={c.selection.title ?? 0} disabled={!editable} preview />
          <OptionPicker contentId={c.id} field="caption" options={c.options.caption ?? []} selected={c.selection.caption ?? 0} disabled={!editable} preview />
          <OptionPicker contentId={c.id} field="hashtags" options={c.options.hashtags ?? []} selected={c.selection.hashtags ?? 0} disabled={!editable} preview />
        </div>
      )}

      {tab === "video" && (
        <div className="grid" style={{ gridTemplateColumns: "minmax(220px,300px) 1fr" }}>
          <VideoBox url={render?.url} status={render?.status} phase={render?.phase} />
          <div className="card pad">
            <div className="section"><h2>Render</h2>{render && <span className={pillClass(render.status)}>{render.status}</span>}</div>
            {render ? (
              <>
                <div style={{ margin: "4px 0 12px" }}><RenderControls contentId={c.id} approved={c.status === "approved"} render={render} /></div>
                <div className="kv"><label>Scene images</label><strong>{render.steps.filter((s) => s.status === "completed").length} / {render.steps.length || c.scenes.length}</strong></div>
                <div className="kv"><label>Stage</label><strong>{render.phase === "compose" ? "Composing final cut" : render.phase === "done" ? "Done" : "Creating scene images"}</strong></div>
                <div className="kv"><label>Model</label><strong>{render.model ?? "—"}</strong></div>
                {render.error && <div className="note amber">{render.error}</div>}
              </>
            ) : (
              <div className="stack">
                <p className="small muted">Render this content now to preview and download it — publishing only happens when the project is scheduled and active.</p>
                <RenderControls contentId={c.id} approved={c.status === "approved"} render={null} />
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
