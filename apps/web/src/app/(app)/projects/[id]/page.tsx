import Link from "next/link";
import { ArrowRight, Check, Clock, Pause, Play, Square } from "lucide-react";
import { OPTION_FIELDS, describeSchedule, resolveContent } from "@acs/domain";
import { OptionPicker } from "@/components/content/option-picker";
import { RenderControls } from "@/components/content/render-controls";
import { AssetsPanel } from "@/components/project/assets-panel";
import { AgentPanel } from "@/components/project/agent-panel";
import { AgentActions } from "@/components/project/agent-actions";
import { ReviewFlow } from "@/components/content/review-flow";
import { AutomationForm } from "@/components/project/automation-form";
import { GeneratingView } from "@/components/project/generating-view";
import { ScheduleForm } from "@/components/project/schedule-form";
import { WorkspaceFrame } from "@/components/project/workspace-frame";
import { ActionButton } from "@/components/ui/action-button";
import { LiveRefresh } from "@/components/ui/live-refresh";
import { VideoBox } from "@/components/ui/video-player";
import { fmtDateTime, pillClass, statusLabel, timeAgo } from "@/lib/format";
import { loadWorkspace } from "@/lib/server/queries";
import { requireUser } from "@/lib/server/session";

const TABS = [
  ["overview", "Overview"],
  ["content", "Content"],
  ["kit", "Creative Kit"],
  ["assets", "Assets"],
  ["schedule", "Schedule"],
  ["videos", "Videos"],
  ["activity", "Activity"],
] as const;
type Tab = (typeof TABS)[number][0];

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; review?: string; view?: string }>;
}) {
  const [{ id }, { tab: rawTab, review, view }] = await Promise.all([params, searchParams]);
  const { supabase, user } = await requireUser();
  const ws = await loadWorkspace(supabase, user.id, id);
  const { project: p, contents, run, readiness } = ws;
  const tab: Tab = (TABS.find(([k]) => k === rawTab)?.[0] ?? "overview") as Tab;

  const live = (
    <LiveRefresh
      sources={[
        { table: "projects", filter: `id=eq.${p.id}` },
        { table: "generation_runs", filter: `project_id=eq.${p.id}` },
        { table: "contents", filter: `project_id=eq.${p.id}` },
        { table: "video_renders", filter: `project_id=eq.${p.id}` },
        { table: "publish_jobs", filter: `project_id=eq.${p.id}` },
        { table: "activity_events", filter: `project_id=eq.${p.id}` },
        ...(ws.conversationId ? [{ table: "messages", filter: `conversation_id=eq.${ws.conversationId}` }] : []),
      ]}
    />
  );

  if (p.status === "generating" || (p.status === "failed" && !contents.length)) {
    return (
      <>
        {live}
        <GeneratingView projectId={p.id} run={run} messages={ws.messages} failed={p.status === "failed"} />
      </>
    );
  }

  const approved = contents.filter((c) => c.status === "approved").length;
  const drafts = contents.length - approved;
  const ideating = run?.kind === "ideation" && (run.status === "queued" || run.status === "running");
  const editable = p.status !== "stopped";
  const kit = p.creative_kit ?? {};

  return (
    <>
      {live}
      <WorkspaceFrame
        agent={
          <AgentPanel
            projectId={p.id}
            projectTitle={p.title}
            messages={ws.messages}
            actions={
              <AgentActions
                projectId={p.id}
                status={p.status}
                drafts={drafts}
                firstPendingId={contents.find((c) => c.status === "draft")?.id ?? null}
                hasSchedule={Boolean(p.schedule?.days?.length)}
                approvedWithoutVideo={contents.filter((c) => c.status === "approved" && !["queued", "rendering", "ready"].includes(ws.renders.get(c.id)?.status ?? "")).length}
              />
            }
          />
        }
      >
        <main className="page">
          <div className="project-hero">
            <div>
              <div className="eyebrow">PROJECT WORKSPACE</div>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <h1>{p.cover_emoji ? `${p.cover_emoji} ` : ""}{p.title}</h1>
                <span className={pillClass(p.status)}>{statusLabel(p.status)}</span>
              </div>
              <p>{p.summary || p.prompt}</p>
              <div className="tagrow">
                {kit.language && <span className="badge-outline">{kit.language}</span>}
                <span className="badge-outline">{contents.length} content</span>
                <span className="badge-outline">YouTube Shorts</span>
                <span className="badge-outline">{describeSchedule(p.schedule)}</span>
              </div>
            </div>
            <div className="actions">
              {p.status === "draft" && (
                <ActionButton
                  path={`/api/projects/${p.id}/lifecycle`}
                  body={{ action: "activate" }}
                  className="btn primary"
                  disabled={!readiness.canActivate}
                  title={readiness.canActivate ? "Start rendering and scheduled publishing" : "Finish the readiness checklist first"}
                >
                  <Play size={14} /> Activate Project
                </ActionButton>
              )}
              {p.status === "active" && (
                <ActionButton path={`/api/projects/${p.id}/lifecycle`} body={{ action: "pause" }}><Pause size={14} /> Pause</ActionButton>
              )}
              {p.status === "paused" && (
                <ActionButton path={`/api/projects/${p.id}/lifecycle`} body={{ action: "resume" }} className="btn primary"><Play size={14} /> Resume</ActionButton>
              )}
              {["active", "paused", "draft"].includes(p.status) && (
                <ActionButton
                  path={`/api/projects/${p.id}/lifecycle`}
                  body={{ action: "stop" }}
                  confirm="Stop this project? Scheduled uploads and queued renders are cancelled. Published videos stay on YouTube."
                  className="btn ghost"
                >
                  <Square size={13} /> Stop
                </ActionButton>
              )}
            </div>
          </div>

          <nav className="tabs" style={{ marginTop: 22 }}>
            {TABS.map(([key, label]) => (
              <Link key={key} href={`/projects/${p.id}?tab=${key}`} className={`tab ${tab === key ? "active" : ""}`} scroll={false}>
                {label}
                {key === "content" && drafts > 0 ? ` · ${drafts}` : ""}
              </Link>
            ))}
          </nav>

          {tab === "overview" && (
            <div className="grid" style={{ gridTemplateColumns: "minmax(0,1.2fr) minmax(0,.9fr)" }}>
              <div className="stack">
                <div className="card pad">
                  <div className="section">
                    <div><h2>Project readiness</h2><p>Review content, schedule it and connect YouTube — then activate.</p></div>
                    <span className={pillClass(p.status === "draft" ? "pending" : p.status)}>{p.status === "draft" ? "Preparing" : statusLabel(p.status)}</span>
                  </div>
                  <div className="checks">
                    {readiness.steps.map((s) => (
                      <div key={s.key} className="checkrow">
                        <span className={`checkdot ${s.done ? "done" : ""}`}>{s.done ? <Check size={12} /> : <Clock size={12} />}</span>
                        <div><div className="semibold">{s.label}</div><div className="xs muted">{s.detail}</div></div>
                      </div>
                    ))}
                  </div>
                  <div className="divider" />
                  <div className="row between">
                    <span className="xs muted">
                      {p.status === "active" ? "Active: videos render automatically and upload at each slot." : "Next step"}
                    </span>
                    {p.status === "draft" && <NextStep steps={readiness.steps} projectId={p.id} />}
                  </div>
                </div>

                <div className="card pad">
                  <div className="section">
                    <div><h2>Content plan</h2><p>Click a content to review every option and scene.</p></div>
                    <Link href={`/projects/${p.id}?tab=content`} className="linklike">All content →</Link>
                  </div>
                  {contents.map((c) => {
                    const r = ws.renders.get(c.id);
                    const j = ws.jobs.get(c.id);
                    return (
                      <Link key={c.id} href={`/projects/${p.id}/content/${c.id}`} className="listrow rowclick" style={{ textDecoration: "none" }}>
                        <div className="row">
                          <span className={`iconTile ${c.status === "approved" ? "green" : "peach"}`}>{c.status === "approved" ? <Check size={15} /> : <Clock size={15} />}</span>
                          <div>
                            <div className="small semibold">{resolveContent(c.options, c.selection).title}</div>
                            <div className="xs muted">{c.scenes.length} scenes · {c.scheduled_for ? fmtDateTime(c.scheduled_for, p.schedule.timezone) : "no slot yet"}</div>
                          </div>
                        </div>
                        <div className="row">
                          {j?.status === "published" ? <span className="pill approved">Published</span> : r ? <span className={pillClass(r.status)}>Video {r.status}</span> : null}
                          <span className={pillClass(c.status)}>{c.status === "approved" ? "Approved" : "Pending"}</span>
                          <span className="icbtn"><ArrowRight size={14} /></span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>

              <div className="stack">
                <div className="card pad">
                  <div className="section"><h2>Creative Kit</h2><Link href={`/projects/${p.id}?tab=kit`} className="linklike">View →</Link></div>
                  <div className="tagrow" style={{ marginTop: 0 }}>
                    {[kit.tone, kit.audience, kit.language].filter(Boolean).map((t) => <span key={t} className="pill">{t}</span>)}
                  </div>
                  {kit.visualStyle && <div className="note" style={{ marginTop: 14 }}>{kit.visualStyle}</div>}
                </div>
                <div className="card pad">
                  <div className="section"><h2>Automation</h2><Link href={`/projects/${p.id}?tab=schedule`} className="linklike">Manage →</Link></div>
                  <div className="kv"><label>Publishing</label><strong>{describeSchedule(p.schedule)}</strong></div>
                  <div className="kv"><label>Destination</label><strong>YouTube Shorts</strong></div>
                  <div className="kv"><label>Recurring ideation</label><strong>{p.ideation_enabled ? `Every ${p.ideation_every_days} days` : "Off"}</strong></div>
                  <div className="kv"><label>Videos ready</label><strong>{[...ws.renders.values()].filter((r) => r.status === "ready").length} / {approved}</strong></div>
                </div>
              </div>
            </div>
          )}

          {tab === "content" && view !== "list" && drafts > 0 && (
            <div className="stack">
              <div className="row between">
                <span className="xs muted">Pick the best option for each field, then approve. Locked once approved.</span>
                <Link className="btn small ghost" href={`/projects/${p.id}?tab=content&view=list`}>All content →</Link>
              </div>
              <ReviewFlow
                projectId={p.id}
                currentId={review}
                items={contents.map((c, i) => ({
                  id: c.id,
                  n: i + 1,
                  status: c.status,
                  options: c.options,
                  selection: c.selection,
                  scenes: c.scenes.map((sc) => ({ heading: sc.heading, onScreenText: sc.onScreenText })),
                }))}
              />
            </div>
          )}

          {tab === "content" && (view === "list" || !drafts) && (
            <div className="stack">
              <div className="card pad row between" style={{ flexWrap: "wrap" }}>
                <div>
                  <h2 style={{ fontSize: 16 }}>{drafts ? `${drafts} content waiting for approval` : "All content approved"}</h2>
                  <p className="xs muted" style={{ marginTop: 5 }}>Every field has AI-generated options — pick one from the dropdown. Approve everything at once when you’re happy.</p>
                </div>
                <div className="actions">
                  {editable && (
                    <ActionButton path={`/api/projects/${p.id}/generate-more`} body={{ count: 3 }} className="btn soft" disabled={ideating}>
                      {ideating ? "Generating…" : "Generate 3 more"}
                    </ActionButton>
                  )}
                  {drafts > 0 && editable && (
                    <ActionButton path={`/api/projects/${p.id}/approve-all`} className="btn primary"><Check size={14} /> Approve all ({drafts})</ActionButton>
                  )}
                </div>
              </div>
              {ideating && <div className="note pulse">The agent is drafting new ideas — they appear here automatically.</div>}
              {drafts > 0 && (
                <div className="row"><Link className="btn small soft" href={`/projects/${p.id}?tab=content`}>▶️ Review one by one</Link></div>
              )}
              {contents.map((c, i) => {
                const picked = resolveContent(c.options, c.selection);
                return (
                  <div key={c.id} className="card pad">
                    <div className="section">
                      <div>
                        <div className="eyebrow">CONTENT {String(i + 1).padStart(2, "0")} · {c.scenes.length} SCENES</div>
                        <h2>{picked.title}</h2>
                      </div>
                      <div className="row">
                        <span className={pillClass(c.status)}>{c.status === "approved" ? "Approved" : "Pending"}</span>
                        <RenderControls contentId={c.id} approved={c.status === "approved"} render={ws.renders.get(c.id)} />
                        {c.status === "approved" && editable && ws.jobs.get(c.id)?.status !== "published" && (
                          <ActionButton path={`/api/contents/${c.id}/unlock`} className="btn small ghost" title="Unlock to change options (removes approval)">🔓 Unlock</ActionButton>
                        )}
                        <Link href={`/projects/${p.id}/content/${c.id}`} className="btn small">Details →</Link>
                      </div>
                    </div>
                    <div className="grid g2" style={{ gap: "0 24px" }}>
                      {OPTION_FIELDS.filter((f) => f !== "script").map((f) => (
                        <OptionPicker
                          key={f}
                          contentId={c.id}
                          field={f}
                          options={c.options[f] ?? []}
                          selected={c.selection[f] ?? 0}
                          disabled={!editable || c.status !== "draft"}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === "kit" && (
            <div className="grid g2">
              <div className="card pad">
                <div className="section"><h2>Creative Kit</h2><span className="pill">Generated</span></div>
                {(
                  [
                    ["Tone", kit.tone],
                    ["Audience", kit.audience],
                    ["Language", kit.language],
                    ["Voice", kit.voice],
                    ["Visual style", kit.visualStyle],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="kv"><label>{k}</label><span className="small" style={{ textAlign: "right" }}>{v || "—"}</span></div>
                ))}
                <div className="divider" />
                <div className="eyebrow">CONTENT PILLARS</div>
                <div className="tagrow">{(kit.pillars ?? []).map((t) => <span key={t} className="tag">{t}</span>)}</div>
                <div className="eyebrow" style={{ marginTop: 16 }}>GUARDRAILS</div>
                <div className="checks">{(kit.guardrails ?? []).map((g) => <div key={g} className="checkrow"><span className="checkdot">!</span>{g}</div>)}</div>
              </div>
              <div className="card pad">
                <div className="section"><h2>Research angles</h2><span className="pill blue">Agent research</span></div>
                {ws.research.length ? ws.research.map((a) => (
                  <div key={a.title} className="listrow"><div><div className="small semibold">{a.title}</div><div className="xs muted">{a.why}</div></div></div>
                )) : <p className="small muted">No research notes for this project.</p>}
                <div className="note" style={{ marginTop: 14 }}>Ask the agent on the left to adjust tone or direction — it can draft new ideas in this style.</div>
              </div>
            </div>
          )}

          {tab === "assets" && (
            <AssetsPanel projectId={p.id} mode={p.visual_mode} assets={ws.assets} editable={editable} />
          )}

          {tab === "schedule" && (
            <div className="grid" style={{ gridTemplateColumns: "minmax(0,1.1fr) minmax(0,.9fr)" }}>
              <div className="card pad">
                <div className="section"><div><h2>Publishing schedule</h2><p>Each content gets the next free slot, in order.</p></div></div>
                {editable ? <ScheduleForm projectId={p.id} initial={p.schedule} timezone={ws.timezone} /> : <p className="small muted">Stopped projects can’t be rescheduled.</p>}
              </div>
              <div className="stack">
                <div className="card pad">
                  <div className="section"><h2>Upcoming slots</h2></div>
                  {contents.filter((c) => c.scheduled_for).map((c) => {
                    const j = ws.jobs.get(c.id);
                    return (
                      <div key={c.id} className="listrow">
                        <div><div className="small semibold">{resolveContent(c.options, c.selection).title}</div><div className="xs muted">{fmtDateTime(j?.scheduled_for ?? c.scheduled_for, p.schedule.timezone)}</div></div>
                        <span className={pillClass(j?.status ?? c.status)}>{j ? statusLabel(j.status) : c.status === "approved" ? "Approved" : "Pending"}</span>
                      </div>
                    );
                  })}
                  {!contents.some((c) => c.scheduled_for) && <p className="small muted">Save a schedule to assign slots.</p>}
                </div>
                <div className="card pad">
                  <div className="section"><h2>Automation</h2></div>
                  <AutomationForm projectId={p.id} enabled={p.ideation_enabled} everyDays={p.ideation_every_days} />
                </div>
              </div>
            </div>
          )}

          {tab === "videos" && (
            <>
              <div className="note" style={{ marginBottom: 16 }}>
                Render any approved content now and download it. Uploads to YouTube happen only for scheduled content in an active project
                {p.status === "active" ? " — this project is active, so missing videos render automatically." : "."}
              </div>
              <div className="videogrid">
                {contents.filter((c) => c.status === "approved").map((c) => {
                  const r = ws.renders.get(c.id);
                  const j = ws.jobs.get(c.id);
                  return (
                    <div key={c.id} className="video-card">
                      <VideoBox url={r?.url} status={r?.status} phase={r?.phase} />
                      <div className="small semibold">{resolveContent(c.options, c.selection).title}</div>
                      <div className="xs muted">
                        {j?.status === "published" ? "Published" : j ? `Uploads ${fmtDateTime(j.scheduled_for, p.schedule.timezone)}` : "Not scheduled"}
                        {j?.external_url && <> · <a className="linklike" href={j.external_url} target="_blank" rel="noreferrer">YouTube →</a></>}
                      </div>
                      <RenderControls contentId={c.id} approved render={r} />
                      {r?.status === "failed" && r.error && <span className="err">{r.error}</span>}
                    </div>
                  );
                })}
                {!approved && <p className="small muted">Approve content to render videos.</p>}
              </div>
            </>
          )}

          {tab === "activity" && (
            <div className="card pad">
              <div className="section"><h2>Activity</h2></div>
              {ws.activity.map((a) => (
                <div key={a.id} className="listrow"><span className="small">{a.message}</span><span className="xs faint">{timeAgo(a.created_at)}</span></div>
              ))}
              {!ws.activity.length && <p className="small muted">No activity yet.</p>}
            </div>
          )}
        </main>
      </WorkspaceFrame>
    </>
  );
}

function NextStep({ steps, projectId }: { steps: { key: string; done: boolean }[]; projectId: string }) {
  const next = steps.find((s) => !s.done)?.key;
  const map: Record<string, [string, string]> = {
    approved: [`/projects/${projectId}?tab=content`, "Review content"],
    scheduled: [`/projects/${projectId}?tab=schedule`, "Set schedule"],
    youtube: ["/settings?section=connections", "Connect YouTube"],
  };
  if (!next || !map[next]) return <span className="pill approved">Ready to activate</span>;
  return <Link href={map[next][0]} className="btn soft">{map[next][1]} →</Link>;
}
