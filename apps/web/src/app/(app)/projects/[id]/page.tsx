import Link from "next/link";
import { Clock, Pause, Play, Plus, Square, X } from "lucide-react";
import { parseEnding, projectKit, resolveContent, type SetupStage } from "@acs/domain";
import { AssetsPanel } from "@/components/project/assets-panel";
import { AgentPanel } from "@/components/project/agent-panel";
import { AgentActions } from "@/components/project/agent-actions";
import { EndingForm } from "@/components/project/ending-form";
import { LaunchPanel } from "@/components/project/launch-panel";
import { ScheduleForm } from "@/components/project/schedule-form";
import { SetupView } from "@/components/project/setup-view";
import { WorkspaceFrame } from "@/components/project/workspace-frame";
import { ActionButton } from "@/components/ui/action-button";
import { LiveRefresh } from "@/components/ui/live-refresh";
import { fmtDateTime, pillClass, statusLabel, timeAgo } from "@/lib/format";
import { loadWorkspace } from "@/lib/server/queries";
import { storyboardImageUrls, usableStoryboard, type StoryboardFrame } from "@/lib/server/storyboard";
import { requireUser } from "@/lib/server/session";
import { setupStale } from "@/lib/server/setup";
import { contentStage, stageStatus } from "@/lib/pipeline";
import type { ContentRow } from "@/lib/server/rows";
import { ContentPanel } from "@/components/project/content-panel";
import { PipelineBoard, type BoardItem } from "@/components/project/pipeline-board";
import { projectSignals } from "@/lib/server/signals";
import { SignalBadges } from "@/components/project/signal-badges";

const TABS = [
  ["pipeline", "Pipeline"],
  ["kit", "Kit"],
  ["assets", "Assets"],
  ["schedule", "Schedule"],
  ["activity", "Activity"],
] as const;
type Tab = (typeof TABS)[number][0];

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; c?: string; launch?: string }>;
}) {
  const [{ id }, { tab: rawTab, c: selectedId, launch }] = await Promise.all([params, searchParams]);
  const { supabase, user } = await requireUser();
  const ws = await loadWorkspace(supabase, user.id, id);
  const { project: p, contents, run, readiness } = ws;
  const tab: Tab = (TABS.find(([k]) => k === rawTab)?.[0] ?? "pipeline") as Tab;

  // Something is in flight → poll as a safety net behind realtime.
  const inFlight =
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
              thinking={sp.setup_busy && !setupStale(sp) && sp.setup_stage === "similar"}
              placeholder="Answer the agent, or ask to change anything…"
            />
          }
        >
          <main className="page">
            <div className="eyebrow">NEW PROJECT · SETUP</div>
            <h1 style={{ fontSize: 27, marginBottom: 18 }}>{p.emoji ? `${p.emoji} ` : ""}{p.title}</h1>
            <SetupView
              projectId={p.id}
              stage={sp.setup_stage}
              busy={sp.setup_busy}
              stale={setupStale(sp)}
              idea={p.idea}
              concept={p.concept ?? {}}
              kit={p.kit ?? {}}
              ending={(p as typeof p & { ending?: unknown }).ending}
              similarPending={ws.messages.at(-1)?.role === "assistant" && Boolean(ws.messages.at(-1)?.meta?.similar)}
            />
          </main>
        </WorkspaceFrame>
      </>
    );
  }

  // No content yet: the first ideas are being drafted (chat on the side), or that run failed.
  const drafting = !contents.length && run && (run.status === "queued" || run.status === "running");
  const draftFailed = !contents.length && run?.status === "failed";
  if (drafting || draftFailed) {
    const progress = Math.max(run?.progress ?? 5, 5);
    return (
      <>
        {live}
        <WorkspaceFrame splitKey={p.id} agent={<AgentPanel projectId={p.id} projectTitle={p.title} messages={ws.messages} />}>
          <main className="page">
            <div className="eyebrow">PROJECT WORKSPACE</div>
            <h1 style={{ fontSize: 27, marginBottom: 18 }}>{p.emoji ? `${p.emoji} ` : ""}{p.title}</h1>
            <div className="card pad">
              {draftFailed ? (
                <div className="row between" style={{ flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <div className="semibold">Drafting didn&apos;t finish</div>
                    <div className="xs muted">{run?.error || "Nothing was published. Try again — your setup is kept."}</div>
                  </div>
                  <ActionButton path={`/api/projects/${p.id}/ideas/retry`} className="btn primary">Try again</ActionButton>
                </div>
              ) : (
                <>
                  <div className="row" style={{ gap: 12 }}>
                    <span className="spin" style={{ display: "inline-flex" }}><Clock size={18} /></span>
                    <div>
                      <div className="semibold">Drafting your first content from the setup…</div>
                      <div className="xs muted">Hooks, scripts and scenes in your narrator&apos;s voice. It opens here automatically.</div>
                    </div>
                  </div>
                  <div className="progressbar" style={{ marginTop: 16 }}><span style={{ width: `${progress}%` }} /></div>
                </>
              )}
            </div>
          </main>
        </WorkspaceFrame>
      </>
    );
  }

  const signals = (await projectSignals(supabase, [p])).get(p.id);
  const editable = p.status !== "stopped";
  const kit = projectKit(p);
  const tz = p.schedule?.timezone;
  const ideating = run?.kind === "ideation" && (run.status === "queued" || run.status === "running");
  const ideas = contents.filter((c) => c.status === "idea").length;
  const approved = contents.filter((c) => c.status === "approved").length;
  const youtubeOk = readiness.steps.find((s) => s.key === "youtube")?.done ?? false;

  // Pipeline: one card per content in its stage.
  const items: BoardItem[] = contents.map((c, i) => {
    const r = ws.renders.get(c.id);
    const j = ws.jobs.get(c.id);
    const stage = contentStage(c, r, j);
    const st = stageStatus(stage, c, r, j);
    const picked = resolveContent(c.options, c.selection);
    return {
      id: c.id,
      n: i + 1,
      title: picked.title,
      hook: picked.hook,
      stage,
      line: st.text,
      needsYou: st.needsYou,
      busy: st.busy,
      slot: stage === "publish" && j && j.status !== "published" ? fmtDateTime(j.scheduled_for, tz) : null,
    };
  });

  // Side panel: the selected content (scene images signed only for it).
  const selIdx = contents.findIndex((c) => c.id === selectedId);
  const sel = selIdx >= 0 ? contents[selIdx] : undefined;
  const selRow = sel as (ContentRow & { storyboard?: StoryboardFrame[] | null; storyboard_status?: string; storyboard_key?: string | null }) | undefined;
  const selFrames = selRow ? await usableStoryboard(selRow, p as Parameters<typeof usableStoryboard>[1]) : null;
  const selImages = selFrames ? await storyboardImageUrls(selFrames) : [];

  // One primary next action for the project.
  const next =
    ideas > 0
      ? { label: `Approve & schedule (${ideas})`, href: `/projects/${p.id}?launch=1` }
      : p.status === "draft" && approved > 0
        ? { label: youtubeOk ? "Go live" : "Schedule & go live", href: `/projects/${p.id}?launch=1` }
        : null;

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
                drafts={ideas}
                firstPendingId={contents.find((c) => c.status === "idea")?.id ?? null}
                hasSchedule={Boolean(p.schedule?.days?.length)}
                approvedWithoutVideo={contents.filter((c) => c.status === "approved" && !["queued", "rendering", "ready"].includes(ws.renders.get(c.id)?.status ?? "")).length}
              />
            }
          />
        }
      >
        <main className="page workspace-page">
          <div className="project-hero">
            <div style={{ minWidth: 0 }}>
              <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                <h1>{p.emoji ? `${p.emoji} ` : ""}{p.title}</h1>
                <span className={pillClass(p.status)}>{statusLabel(p.status)}</span>
                <SignalBadges s={signals} status={p.status} timezone={tz} />
              </div>
              <p>{kit.niche || p.summary || p.idea}</p>
            </div>
            <div className="actions">
              {next && editable && (
                <Link href={next.href} scroll={false} className="btn primary"><Play size={14} /> {next.label}</Link>
              )}
              {!next && editable && p.status === "live" && (
                <ActionButton path={`/api/projects/${p.id}/ideas`} body={{ count: 3 }} className="btn primary" disabled={ideating}>
                  <Plus size={14} /> {ideating ? "Drafting ideas…" : "New ideas"}
                </ActionButton>
              )}
              {p.status === "live" && (
                <ActionButton path={`/api/projects/${p.id}/lifecycle`} body={{ action: "pause" }}><Pause size={14} /> Pause</ActionButton>
              )}
              {p.status === "paused" && (
                <ActionButton path={`/api/projects/${p.id}/lifecycle`} body={{ action: "resume" }} className="btn primary"><Play size={14} /> Resume</ActionButton>
              )}
              {["live", "paused"].includes(p.status) && (
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

          <nav className="tabs" style={{ marginTop: 16 }}>
            {TABS.map(([key, label]) => (
              <Link key={key} href={`/projects/${p.id}?tab=${key}`} className={`tab ${tab === key ? "active" : ""}`} scroll={false}>
                {label}
                {key === "pipeline" && ideas > 0 ? ` · ${ideas}` : ""}
              </Link>
            ))}
          </nav>

          {tab === "pipeline" && (
            <>
              {ideating && <div className="note pulse" style={{ marginBottom: 12 }}>The agent is drafting new ideas — they appear in Ideas automatically.</div>}
              <PipelineBoard projectId={p.id} items={items} selectedId={sel?.id} editable={editable} ideating={Boolean(ideating)} />
            </>
          )}

          {tab === "kit" && (
            <div className="grid g2">
              <div className="card pad">
                <div className="section"><h2>Concept</h2><span className="pill">What &amp; for whom</span></div>
                {(
                  [
                    ["Niche", kit.niche],
                    ["Audience", kit.audience],
                    ["Goal", kit.goal],
                    ["Content language", kit.language],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="kv"><label>{k}</label><span className="small" style={{ textAlign: "right" }}>{v || "—"}</span></div>
                ))}
                <div className="divider" />
                <div className="eyebrow">PILLARS</div>
                <ul className="setup-points">{(kit.pillars ?? []).map((t) => <li key={t}><span>{t}</span></li>)}</ul>
                <div className="eyebrow" style={{ marginTop: 16 }}>GUARDRAILS</div>
                <ul className="setup-points">{(kit.guardrails ?? []).map((g) => <li key={g}><span>{g}</span></li>)}</ul>
                <div className="note" style={{ marginTop: 14 }}>Ask the agent on the left to change anything here — new ideas follow it.</div>
              </div>
              <div className="card pad">
                <div className="section"><h2>Creative Kit</h2><span className="pill">How it looks &amp; sounds</span></div>
                {(
                  [
                    ["Tone", kit.tone],
                    ["Format", kit.format],
                    ["Opening", kit.opening],
                    ["Narrator style", kit.voice],
                    ["ElevenLabs voice", p.voice_name ?? "Chosen on first render"],
                    ["Visual style", kit.visualStyle],
                    ["Palette", kit.palette],
                    ["Recurring character", kit.recurringSubject],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="kv"><label>{k}</label><span className="small" style={{ textAlign: "right" }}>{v || "—"}</span></div>
                ))}
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
                <div className="section"><div><h2>Publishing schedule</h2><p>Each approved content gets the next free slot, in order.</p></div></div>
                {editable ? <ScheduleForm projectId={p.id} initial={p.schedule} timezone={ws.timezone} /> : <p className="small muted">Stopped projects can’t be rescheduled.</p>}
              </div>
              <div className="stack">
                <div className="card pad">
                  <div className="section"><h2>Upcoming slots</h2></div>
                  {contents.filter((c) => c.scheduled_for).map((c) => {
                    const j = ws.jobs.get(c.id);
                    return (
                      <Link key={c.id} href={`/projects/${p.id}?c=${c.id}`} scroll={false} className="listrow rowclick" style={{ textDecoration: "none" }}>
                        <div><div className="small semibold">{resolveContent(c.options, c.selection).title}</div><div className="xs muted">{fmtDateTime(j?.scheduled_for ?? c.scheduled_for, tz)}</div></div>
                        <span className={pillClass(j?.status ?? c.status)}>{c.on_hold ? "On hold" : j ? statusLabel(j.status) : c.status === "approved" ? "Approved" : "Pending"}</span>
                      </Link>
                    );
                  })}
                  {!contents.some((c) => c.scheduled_for) && <p className="small muted">Approve &amp; schedule content to assign slots.</p>}
                </div>
              </div>
            </div>
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

      {/* Side panels (URL-driven: ?c=<content> or ?launch=1) */}
      {sel && (
        <>
          <Link href={`/projects/${p.id}`} scroll={false} className="panel-backdrop" aria-label="Close" />
          <ContentPanel
            projectId={p.id}
            c={sel}
            n={selIdx + 1}
            stage={contentStage(sel, ws.renders.get(sel.id), ws.jobs.get(sel.id))}
            render={ws.renders.get(sel.id)}
            job={ws.jobs.get(sel.id)}
            images={selImages}
            drawing={sel.storyboard_status === "generating"}
            editable={editable}
            timezone={tz}
          />
        </>
      )}
      {!sel && launch && editable && (
        <>
          <Link href={`/projects/${p.id}`} scroll={false} className="panel-backdrop" aria-label="Close" />
          <aside className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Approve &amp; schedule</h2>
              <Link href={`/projects/${p.id}`} scroll={false} className="icbtn" aria-label="Close"><X size={15} /></Link>
            </div>
            <div className="panel-body">
              <LaunchPanel
                projectId={p.id}
                projectStatus={p.status}
                schedule={p.schedule}
                youtubeConnected={youtubeOk}
                items={contents
                  .map((c, i) => ({ c, n: i + 1 }))
                  .filter(({ c }) => !["published", "publishing"].includes(ws.jobs.get(c.id)?.status ?? "") && (p.status === "draft" || c.status === "idea"))
                  .map(({ c, n }) => ({ id: c.id, n, title: resolveContent(c.options, c.selection).title, status: c.status, scenes: c.scenes.length }))}
              />
            </div>
          </aside>
        </>
      )}
    </>
  );
}
