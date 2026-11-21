import Link from "next/link";
import { ArrowRight, Check, Clock, Pause, Play, Square } from "lucide-react";
import { OPTION_FIELDS, describeSchedule, parseEnding, resolveContent, type Concept, type SetupStage } from "@acs/domain";
import { OptionPicker } from "@/components/content/option-picker";
import { RenderControls } from "@/components/content/render-controls";
import { AssetsPanel } from "@/components/project/assets-panel";
import { AgentPanel } from "@/components/project/agent-panel";
import { AgentActions } from "@/components/project/agent-actions";
import { ReviewFlow } from "@/components/content/review-flow";
import { AutomationForm } from "@/components/project/automation-form";
import { EndingForm } from "@/components/project/ending-form";
import { LaunchPanel } from "@/components/project/launch-panel";
import { GeneratingView } from "@/components/project/generating-view";
import { ScheduleForm } from "@/components/project/schedule-form";
import { SetupView } from "@/components/project/setup-view";
import { WorkspaceFrame } from "@/components/project/workspace-frame";
import { ActionButton } from "@/components/ui/action-button";
import { LiveRefresh } from "@/components/ui/live-refresh";
import { VideoBox } from "@/components/ui/video-player";
import { fmtDateTime, pillClass, statusLabel, timeAgo } from "@/lib/format";
import { loadWorkspace } from "@/lib/server/queries";
import { storyboardImageUrls, usableStoryboard, type StoryboardFrame } from "@/lib/server/storyboard";
import { requireUser } from "@/lib/server/session";
import { setupStale } from "@/lib/server/setup";
import { contentHasMedia } from "@/lib/server/projects";
import { projectSignals } from "@/lib/server/signals";
import { SignalBadges } from "@/components/project/signal-badges";

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

  // Something is in flight → poll as a safety net behind realtime.
  const inFlight =
    p.status === "generating" ||
    (run && (run.status === "queued" || run.status === "running")) ||
    ws.messages.at(-1)?.role === "user" ||
    contents.some((c) => (c as { storyboard_status?: string }).storyboard_status === "generating") ||
    [...ws.renders.values()].some((r) => r.status === "queued" || r.status === "rendering");
  const live = (
    <LiveRefresh
      pollMs={inFlight ? 4000 : undefined}
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

  if (p.status === "setup") {
    const sp = p as typeof p & { setup_stage: SetupStage; setup_busy: boolean; setup_started_at: string | null };
    return (
      <>
        <LiveRefresh
          pollMs={sp.setup_busy || ws.messages.at(-1)?.role === "user" ? 3000 : undefined}
          sources={[
            { table: "projects", filter: `id=eq.${p.id}` },
            ...(ws.conversationId ? [{ table: "messages", filter: `conversation_id=eq.${ws.conversationId}` }] : []),
          ]}
        />
        <WorkspaceFrame
          agent={
            <AgentPanel
              projectId={p.id}
              projectTitle={p.title}
              messages={ws.messages}
              thinking={sp.setup_busy && !setupStale(sp) && sp.setup_stage === "discovery"}
              placeholder="Answer the agent, or ask to change anything…"
            />
          }
        >
          <main className="page">
            <div className="eyebrow">NEW PROJECT · SETUP</div>
            <h1 style={{ fontSize: 27, marginBottom: 18 }}>{p.cover_emoji ? `${p.cover_emoji} ` : ""}{p.title}</h1>
            <SetupView
              projectId={p.id}
              stage={sp.setup_stage}
              busy={sp.setup_busy}
              stale={setupStale(sp)}
              idea={p.prompt}
              concept={(p as typeof p & { concept?: Partial<Concept> }).concept ?? {}}
              kit={p.creative_kit ?? {}}
              ending={(p as typeof p & { ending?: unknown }).ending}
              similarPending={ws.messages.at(-1)?.role === "assistant" && Boolean(ws.messages.at(-1)?.meta?.similar)}
            />
          </main>
        </WorkspaceFrame>
      </>
    );
  }

  // Right after guided setup: the chat moves to the side while the first content is drafted.
  const fromSetup = Boolean((p as typeof p & { concept?: Partial<Concept> }).concept?.title);
  if (p.status === "generating" && fromSetup) {
    const progress = Math.max(run?.progress ?? 5, 5);
    return (
      <>
        {live}
        <WorkspaceFrame splitKey={p.id} agent={<AgentPanel projectId={p.id} projectTitle={p.title} messages={ws.messages} />}>
          <main className="page">
            <div className="eyebrow">PROJECT WORKSPACE</div>
            <h1 style={{ fontSize: 27, marginBottom: 18 }}>{p.cover_emoji ? `${p.cover_emoji} ` : ""}{p.title}</h1>
            <div className="card pad">
              <div className="row" style={{ gap: 12 }}>
                <span className="spin" style={{ display: "inline-flex" }}><Clock size={18} /></span>
                <div>
                  <div className="semibold">Drafting your first content from the setup…</div>
                  <div className="xs muted">Hooks, scripts and scenes in your narrator&apos;s voice. It opens here automatically.</div>
                </div>
              </div>
              <div className="progressbar" style={{ marginTop: 16 }}><span style={{ width: `${progress}%` }} /></div>
            </div>
          </main>
        </WorkspaceFrame>
      </>
    );
  }

  if (p.status === "generating" || (p.status === "failed" && !contents.length)) {
    return (
      <>
        {live}
        <GeneratingView projectId={p.id} run={run} messages={ws.messages} failed={p.status === "failed"} />
      </>
    );
  }

  const signals = (await projectSignals(supabase, [p])).get(p.id);

  // Storyboard images for the content under review (slides in the Content tab).
  const reviewing = contents.find((c) => c.id === review && c.status === "draft") ?? contents.find((c) => c.status === "draft");
  const reviewRow = reviewing as (typeof contents)[number] & { storyboard?: StoryboardFrame[] | null; storyboard_status?: string; storyboard_key?: string | null } | undefined;
  const reviewFrames = reviewRow ? await usableStoryboard(reviewRow, p as Parameters<typeof usableStoryboard>[1]) : null;
  const reviewImages = reviewFrames ? await storyboardImageUrls(reviewFrames) : [];
  const reviewDrawing = reviewRow?.storyboard_status === "generating";

  const approved = contents.filter((c) => c.status === "approved").length;
  const drafts = contents.length - approved;
  const ideating = run?.kind === "ideation" && (run.status === "queued" || run.status === "running");
  const editable = p.status !== "stopped";
  const kit = p.creative_kit ?? {};

  return (
    <>
      {live}
      <WorkspaceFrame
        splitKey={p.id}
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
                <SignalBadges s={signals} status={p.status} timezone={p.schedule?.timezone} />
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
                <Link href={`/projects/${p.id}?tab=overview#launch`} className="btn primary">
                  <Play size={14} /> Approve &amp; schedule
                </Link>
              )}
              {p.status === "active" && (
                <ActionButton path={`/api/projects/${p.id}/lifecycle`} body={{ action: "pause" }}><Pause size={14} /> Pause</ActionButton>
              )}
              {p.status === "paused" && (
                <ActionButton path={`/api/projects/${p.id}/lifecycle`} body={{ action: "resume" }} className="btn primary"><Play size={14} /> Resume</ActionButton>
              )}
              {["active", "paused"].includes(p.status) && (
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
            <div className="grid split-main">
              <div className="stack">
                {editable && (p.status === "draft" || drafts > 0) ? (
                  <LaunchPanel
                    projectId={p.id}
                    projectStatus={p.status}
                    schedule={p.schedule}
                    youtubeConnected={readiness.steps.find((s) => s.key === "youtube")?.done ?? false}
                    items={contents
                      .map((c, i) => ({ c, n: i + 1 }))
                      .filter(({ c }) => !["published", "publishing"].includes(ws.jobs.get(c.id)?.status ?? "") && (p.status === "draft" || c.status === "draft"))
                      .map(({ c, n }) => ({ id: c.id, n, title: resolveContent(c.options, c.selection).title, status: c.status, scenes: c.scenes.length }))}
                  />
                ) : (
                  <div className="note green">{p.status === "active" ? "Live — videos render automatically and upload at each slot." : statusLabel(p.status)}</div>
                )}

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
                          <span className={pillClass(c.on_hold ? "paused" : c.status)}>{c.on_hold ? "On hold" : c.status === "approved" ? "Approved" : "Pending"}</span>
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
                images={reviewRow ? { id: reviewRow.id, urls: reviewImages, drawing: reviewDrawing } : undefined}
                items={contents.map((c, i) => ({
                  id: c.id,
                  n: i + 1,
                  status: c.status,
                  options: c.options,
                  selection: c.selection,
                  scenes: c.scenes.map((sc) => ({ heading: sc.heading, onScreenText: sc.onScreenText, layout: sc.layout, narration: sc.narration, headline: sc.headline, background: sc.background, seconds: sc.seconds, visual: sc.visual })),
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
                    <Link href={`/projects/${p.id}?tab=overview#launch`} className="btn primary"><Check size={14} /> Approve &amp; schedule ({drafts})</Link>
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
                        <span className={pillClass(c.on_hold ? "paused" : c.status)}>{c.on_hold ? "On hold" : c.status === "approved" ? "Approved" : "Pending"}</span>
                        <RenderControls contentId={c.id} approved={c.status === "approved"} render={ws.renders.get(c.id)} />
                        {editable && !["published", "publishing"].includes(ws.jobs.get(c.id)?.status ?? "") && (
                          contentHasMedia(c, ws.renders.get(c.id)) ? (
                            <>
                              <ActionButton path={`/api/contents/${c.id}/hold`} body={{ hold: !c.on_hold }} className="btn small ghost" title={c.on_hold ? "Publish it again at its slot" : "Keep it, but don't publish until you resume"}>
                                {c.on_hold ? "▶ Resume" : "⏸ Hold"}
                              </ActionButton>
                              <ActionButton path={`/api/contents/${c.id}/reject`} confirm="Reject this content? Its images and video are discarded and it won't be published." className="btn small ghost" title="Discard — never published">✕ Reject</ActionButton>
                            </>
                          ) : (
                            <ActionButton path={`/api/contents/${c.id}/reject`} className="btn small ghost" title="Remove this idea">🗑 Remove</ActionButton>
                          )
                        )}
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
                    ["Narrator style", kit.voice],
                    ["ElevenLabs voice", (p as typeof p & { voice_name?: string | null }).voice_name ?? "Chosen on first render"],
                    ["Visual style", kit.visualStyle],
                    ["Palette", kit.palette],
                    ["Recurring subject", kit.recurringSubject],
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
              <div className="card pad" style={{ gridColumn: "1 / -1" }}>
                <div className="section"><div><h2>Ending</h2><p>How every Short ends — the last beat of the script and the end screen of the video.</p></div></div>
                <EndingForm projectId={p.id} initial={parseEnding(p.ending)} editable={editable} />
              </div>
            </div>
          )}

          {tab === "assets" && (
            <AssetsPanel projectId={p.id} mode={p.visual_mode} engine={p.image_engine ?? "openai"} assets={ws.assets} editable={editable} subject={kit.recurringSubject} />
          )}

          {tab === "schedule" && (
            <div className="grid split-main">
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
                        <span className={pillClass(j?.status ?? c.status)}>{c.on_hold ? "On hold" : j ? statusLabel(j.status) : c.status === "approved" ? "Approved" : "Pending"}</span>
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
                      {r ? (
                        <Link href={`/videos/${r.id}`} className="small semibold" style={{ textDecoration: "none" }}>{resolveContent(c.options, c.selection).title} →</Link>
                      ) : (
                        <div className="small semibold">{resolveContent(c.options, c.selection).title}</div>
                      )}
                      <div className="xs muted">
                        {j?.status === "published" ? "Published" : j ? `Uploads ${fmtDateTime(j.scheduled_for, p.schedule.timezone)}` : "Not scheduled"}
                        {j?.external_url && <> · <a className="linklike" href={j.external_url} target="_blank" rel="noreferrer">YouTube →</a></>}
                      </div>
                      <RenderControls contentId={c.id} approved render={r} />
                      {r?.status === "ready" && j?.status !== "published" && j?.status !== "publishing" && (
                        <ActionButton
                          path={`/api/contents/${c.id}/publish`}
                          className="btn small soft"
                          confirm="Upload this video to YouTube now?"
                        >
                          🚀 Publish now
                        </ActionButton>
                      )}
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

