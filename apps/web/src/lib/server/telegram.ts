import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { AppError, ScheduleSchema, describeSchedule, resolveContent, type Schedule } from "@acs/domain";
import {
  chunkMessages,
  tgAction,
  tgAnswer,
  tgEscape as esc,
  tgMessage,
  tgVideo,
  type TgButton,
  type TgCall,
} from "@acs/integrations";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  activateProject,
  approveAll,
  requestRender,
  reviseContents,
  saveSchedule,
  startProject,
  updateAutomation,
} from "./projects";
import { signedVideoUrl } from "./renders";
import type { ContentRow, ProjectRow } from "./rows";
import { appUrl } from "./session";

/**
 * Telegram bot brain. n8n (WF-A2) forwards raw updates here and this module
 * returns the Bot API calls to make; n8n ("SUB Telegram Send") sends them.
 * The app never holds the bot token. Callback data codes (≤64 bytes):
 *   pv:<project>  project cards       aa:<project> approve all + render
 *   rc:<project>  request changes     sc:<project>:<preset> schedule preset
 *   nd:<project>  download only        id:<project>:on|off recurring ideas
 *   ac:<project>  activate             rn:<content> render one
 *   rr:<content>  re-render            ok:<render>  looks good
 *   ra:<project>  render all approved
 */
const admin = () => createAdminClient();

/**
 * Per-request outbox (AsyncLocalStorage keeps concurrent requests apart).
 * Everything the bot "says" is collected here and returned to n8n.
 */
const outbox = new AsyncLocalStorage<TgCall[]>();
const push = (c: TgCall) => outbox.getStore()?.push(c);
const say = (...a: Parameters<typeof tgMessage>) => push(tgMessage(...a));
const sayVideo = (...a: Parameters<typeof tgVideo>) => push(tgVideo(...a));
const act = (...a: Parameters<typeof tgAction>) => push(tgAction(...a));
const answer = (...a: Parameters<typeof tgAnswer>) => push(tgAnswer(...a));

async function collect<T>(fn: () => Promise<T>): Promise<T & { calls: TgCall[] }> {
  const calls: TgCall[] = [];
  const result = await outbox.run(calls, fn);
  return { ...(result as object), calls } as T & { calls: TgCall[] };
}

interface Link {
  id: string;
  owner_id: string;
  telegram_chat_id: number | null;
  state: { currentProjectId?: string; awaiting?: "revise" | null };
}

const SCHEDULE_PRESETS: Record<string, { label: string; days: Schedule["days"]; time: string }> = {
  mt10: { label: "Mon & Thu · 10:00", days: ["mon", "thu"], time: "10:00" },
  d18: { label: "Every day · 18:00", days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], time: "18:00" },
  wd09: { label: "Weekdays · 09:00", days: ["mon", "tue", "wed", "thu", "fri"], time: "09:00" },
};

const STATUS_EMOJI: Record<string, string> = {
  generating: "⏳",
  draft: "📝",
  active: "🟢",
  paused: "⏸",
  stopped: "⏹",
  failed: "⚠️",
};

const open = (path: string): TgButton => ({ text: "🔗 Open in Studio", url: `${appUrl()}${path}` });

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
async function linkFor(telegramUserId: string): Promise<Link | null> {
  const { data } = await admin()
    .from("telegram_links")
    .select("id, owner_id, telegram_chat_id, state")
    .eq("telegram_user_id", telegramUserId)
    .is("revoked_at", null)
    .maybeSingle();
  return (data as Link | null) ?? null;
}

async function setState(link: Link, patch: Link["state"]) {
  link.state = { ...link.state, ...patch };
  await admin().from("telegram_links").update({ state: link.state }).eq("id", link.id);
}

async function ownedProject(ownerId: string, projectId: string) {
  const { data } = await admin().from("projects").select("*").eq("id", projectId).eq("owner_id", ownerId).maybeSingle();
  return (data as (ProjectRow & { visual_mode: string }) | null) ?? null;
}

async function listContents(projectId: string) {
  const { data } = await admin().from("contents").select("*").eq("project_id", projectId).neq("status", "archived").order("position");
  return (data ?? []) as ContentRow[];
}

function todayIn(tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

// ---------------------------------------------------------------------------
// Messages the bot sends
// ---------------------------------------------------------------------------

/** Project header + one card per content + Approve all / Request changes. */
export async function sendProjectCards(chatId: string | number, projectId: string, contentIds?: string[], intro?: string) {
  const db = admin();
  const { data: project } = await db.from("projects").select("*").eq("id", projectId).single();
  const p = project as ProjectRow;
  const all = await listContents(projectId);
  const shown = contentIds?.length ? all.filter((c) => contentIds.includes(c.id)) : all;

  const header = [
    intro ? esc(intro) : null,
    `<b>${esc(`${p.cover_emoji ?? "✨"} ${p.title}`)}</b>`,
    p.summary ? `<i>${esc(p.summary)}</i>` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const cards = shown.map((c) => {
    const n = all.findIndex((x) => x.id === c.id) + 1;
    const r = resolveContent(c.options, c.selection);
    const script = r.script.length > 320 ? `${r.script.slice(0, 317)}…` : r.script;
    return [
      `<b>#${n} · ${esc(r.title)}</b> ${c.status === "approved" ? "✅" : ""}`,
      `🎣 ${esc(r.hook)}`,
      `📝 ${esc(script)}`,
      `🎬 ${c.scenes.length} scenes · ${esc(r.hashtags)}`,
    ].join("\n");
  });

  for (const chunk of chunkMessages([header, ...cards])) say(chatId, chunk);

  const drafts = all.filter((c) => c.status === "draft").length;
  say(
    chatId,
    drafts
      ? `${drafts} content waiting for approval. Approve all to start rendering, or tell me what to change (e.g. <i>“make #2 funnier”</i>).`
      : "All content is approved.",
    [
      ...(drafts ? [[{ text: `✅ Approve all (${drafts})`, data: `aa:${projectId}` }, { text: "✏️ Request changes", data: `rc:${projectId}` }]] : []),
      [open(`/projects/${projectId}?tab=content`)],
    ],
  );
}

async function askAutomation(chatId: string | number, projectId: string) {
  say(chatId, "While the videos render — how should I publish them to YouTube?", [
    ...Object.entries(SCHEDULE_PRESETS).map(([k, v]) => [{ text: `📅 ${v.label}`, data: `sc:${projectId}:${k}` }]),
    [{ text: "📥 Just send me the videos", data: `nd:${projectId}` }],
  ]);
}

// ---------------------------------------------------------------------------
// Notification delivery (WF-06 → /api/internal/notifications/deliver)
// ---------------------------------------------------------------------------
export async function deliverNotification(notificationId: string) {
  return collect(async () => {
    const db = admin();
    const { data: n } = await db.from("notifications").select("*").eq("id", notificationId).maybeSingle();
    if (!n || n.delivery_state === "delivered") return { skip: true };
    const pl = (n.payload ?? {}) as {
      chatId?: string;
      text?: string;
      url?: string | null;
      cards?: { contentIds?: string[] } | null;
      renderId?: string | null;
      buttons?: TgButton[][] | null;
    };
    if (!pl.chatId) return { skip: true, reason: "no chat id" };
    if (pl.renderId) {
      const { data: r } = await db.from("video_renders").select("id, content_id, storage_path").eq("id", pl.renderId).single();
      const url = await signedVideoUrl(r?.storage_path ?? null, 3600);
      if (!url || !r) return { skip: true, reason: "video missing" };
      act(pl.chatId, "upload_video");
      sayVideo(pl.chatId, url, esc(pl.text ?? "Your video is ready"), [
        [{ text: "👍 Looks good", data: `ok:${r.id}` }, { text: "🔁 Re-render", data: `rr:${r.content_id}` }],
        [{ text: "⬇️ Download", url: `${appUrl()}/api/renders/${r.id}/download` }],
      ]);
    } else if (pl.cards && n.project_id) {
      await sendProjectCards(pl.chatId, n.project_id, pl.cards.contentIds, pl.text);
    } else {
      const rows: TgButton[][] = [...(pl.buttons ?? [])];
      if (pl.url) rows.push([{ text: "🔗 Open in Studio", url: pl.url }]);
      say(pl.chatId, esc(pl.text ?? ""), rows);
    }
    return { skip: false };
  });
}

/** n8n reports whether every Telegram call for a notification succeeded. */
export async function completeNotification(notificationId: string, delivered: boolean) {
  await admin()
    .from("notifications")
    .update({ delivery_state: delivered ? "delivered" : "failed", delivered_at: delivered ? new Date().toISOString() : null })
    .eq("id", notificationId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Inbound updates (WF-A2 → /api/internal/telegram/update)
// ---------------------------------------------------------------------------
interface TgUpdate {
  message?: { chat: { id: number; type: string }; from?: { id: number }; text?: string };
  callback_query?: { id: string; from: { id: number }; data?: string; message?: { chat: { id: number; type: string } } };
}

const HELP = [
  "<b>AI Content Studio bot</b>",
  "Send me an idea to start a new project, or use:",
  "/new &lt;idea&gt; — start a project",
  "/projects — your projects",
  "/render — render videos for the current project",
  "/schedule — set publishing for the current project",
  "/edit &lt;feedback&gt; — change content, e.g. <i>/edit make #2 funnier</i>",
  "/help — this message",
].join("\n");

export function handleTelegramUpdate(update: TgUpdate) {
  return collect(() => handleUpdateInner(update));
}

async function handleUpdateInner(update: TgUpdate) {
  const cb = update.callback_query;
  const msg = update.message;
  const chat = cb?.message?.chat ?? msg?.chat;
  const fromId = String(cb?.from.id ?? msg?.from?.id ?? "");
  if (!chat || chat.type !== "private" || !fromId) return { ignored: true };
  const chatId = chat.id;

  const link = await linkFor(fromId);
  if (!link) {
    if (cb) answer(cb.id);
    say(
      chatId,
      `Your Telegram isn't linked yet. In Studio open <b>Settings → Telegram</b> and enter your user ID <code>${fromId}</code>, then message me again.`,
      [[{ text: "🔗 Open Settings", url: `${appUrl()}/settings?section=telegram` }]],
    );
    return { linked: false };
  }
  if (link.telegram_chat_id !== chatId) {
    await admin().from("telegram_links").update({ telegram_chat_id: chatId }).eq("id", link.id);
  }

  try {
    if (cb) return await onCallback(link, chatId, cb.id, cb.data ?? "");
    return await onText(link, chatId, (msg?.text ?? "").trim());
  } catch (e) {
    const message = e instanceof AppError ? e.message : "Something went wrong — please try again.";
    if (cb) answer(cb.id, message);
    say(chatId, `⚠️ ${esc(message)}`);
    if (!(e instanceof AppError)) console.error("[telegram] update failed", e);
    return { ok: false };
  }
}

async function currentProject(link: Link) {
  if (link.state.currentProjectId) {
    const p = await ownedProject(link.owner_id, link.state.currentProjectId);
    if (p) return p;
  }
  const { data } = await admin()
    .from("projects")
    .select("*")
    .eq("owner_id", link.owner_id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ProjectRow | null) ?? null;
}

async function onText(link: Link, chatId: number, text: string) {
  const [cmdRaw, ...rest] = text.split(/\s+/);
  const cmd = cmdRaw?.toLowerCase().replace(/@\w+$/, "") ?? "";
  const arg = rest.join(" ").trim();

  if (!text || cmd === "/start" || cmd === "/help") {
    say(chatId, HELP);
    return { ok: true };
  }

  if (cmd === "/projects") {
    const { data } = await admin()
      .from("projects")
      .select("id, title, status, cover_emoji")
      .eq("owner_id", link.owner_id)
      .order("updated_at", { ascending: false })
      .limit(8);
    if (!data?.length) {
      say(chatId, "No projects yet — send me an idea to start one.");
      return { ok: true };
    }
    say(
      chatId,
      "<b>Your projects</b>\n" + data.map((p) => `${STATUS_EMOJI[p.status] ?? "•"} ${esc(p.title)} — ${p.status}`).join("\n"),
      data.map((p) => [{ text: `${p.cover_emoji ?? "📁"} ${p.title}`.slice(0, 60), data: `pv:${p.id}` }]),
    );
    return { ok: true };
  }

  if (cmd === "/new") {
    if (!arg) {
      say(chatId, "Tell me the idea, e.g. <i>/new weekly cat stories for kids</i>");
      return { ok: true };
    }
    return startFromTelegram(link, chatId, arg);
  }

  if (cmd === "/render" || cmd === "/schedule" || cmd === "/edit") {
    const p = await currentProject(link);
    if (!p) {
      say(chatId, "No project yet — send me an idea first.");
      return { ok: true };
    }
    await setState(link, { currentProjectId: p.id });
    if (cmd === "/schedule") {
      await askAutomation(chatId, p.id);
      return { ok: true };
    }
    if (cmd === "/edit") {
      if (arg) return revise(link, chatId, p.id, arg);
      await setState(link, { awaiting: "revise" });
      say(chatId, `What should I change in <b>${esc(p.title)}</b>? Mention content numbers like <i>#2</i>, or describe it for all.`);
      return { ok: true };
    }
    return renderMenu(chatId, p.id);
  }

  // Free text: pending edit, "#n" edit on the current project, or a new idea.
  if (link.state.awaiting === "revise" && link.state.currentProjectId) {
    await setState(link, { awaiting: null });
    return revise(link, chatId, link.state.currentProjectId, text);
  }
  if (/#\s*\d/.test(text) && link.state.currentProjectId) {
    return revise(link, chatId, link.state.currentProjectId, text);
  }
  return startFromTelegram(link, chatId, text);
}

async function startFromTelegram(link: Link, chatId: number, idea: string) {
  act(chatId, "typing");
  const { projectId } = await startProject({ ownerId: link.owner_id, prompt: idea, channel: "telegram" });
  await setState(link, { currentProjectId: projectId, awaiting: null });
  say(chatId, "On it — creating your project. I'll send the content here for review in about a minute.", [
    [open(`/projects/${projectId}`)],
  ]);
  return { ok: true, projectId };
}

async function revise(link: Link, chatId: number, projectId: string, feedback: string) {
  const res = await reviseContents(link.owner_id, projectId, feedback, "telegram");
  say(chatId, `✏️ Revising ${res.positions.map((n) => `#${n}`).join(", ")} — I'll send the new versions shortly.`);
  return { ok: true };
}

async function renderMenu(chatId: number, projectId: string) {
  const contents = await listContents(projectId);
  const approved = contents.filter((c) => c.status === "approved");
  if (!approved.length) {
    say(chatId, "Nothing approved yet — approve the content first.", [[{ text: "📋 Show content", data: `pv:${projectId}` }]]);
    return { ok: true };
  }
  say(
    chatId,
    "Which videos should I render?",
    [
      [{ text: `🎬 Render all approved (${approved.length})`, data: `ra:${projectId}` }],
      ...approved.slice(0, 8).map((c) => [
        { text: `#${contents.indexOf(c) + 1} ${resolveContent(c.options, c.selection).title}`.slice(0, 60), data: `rn:${c.id}` },
      ]),
    ],
  );
  return { ok: true };
}

async function renderAll(ownerId: string, projectId: string) {
  const approved = (await listContents(projectId)).filter((c) => c.status === "approved");
  const { data: done } = await admin()
    .from("video_renders")
    .select("content_id")
    .eq("project_id", projectId)
    .in("status", ["queued", "rendering", "ready"]);
  const have = new Set((done ?? []).map((r) => r.content_id));
  const todo = approved.filter((c) => !have.has(c.id));
  for (const c of todo) await requestRender(ownerId, c.id);
  return todo.length;
}

async function onCallback(link: Link, chatId: number, callbackId: string, data: string) {
  const [code, id, extra] = data.split(":");
  const owner = link.owner_id;

  // content/render scoped codes
  if (code === "rn" || code === "rr") {
    const { data: c } = await admin().from("contents").select("project_id").eq("id", id).eq("owner_id", owner).maybeSingle();
    if (!c) throw new AppError("NOT_FOUND", "Content not found", 404);
    const r = await requestRender(owner, id);
    answer(callbackId, r.alreadyRunning ? "Already rendering" : "Rendering…");
    if (!r.alreadyRunning) say(chatId, "🎬 Rendering — I'll send the video here when it's ready (about 1–3 minutes).");
    return { ok: true };
  }
  if (code === "ok") {
    answer(callbackId, "👍 Noted");
    return { ok: true };
  }

  const project = await ownedProject(owner, id);
  if (!project) {
    answer(callbackId, "Project not found");
    return { ok: false };
  }
  await setState(link, { currentProjectId: project.id });

  switch (code) {
    case "pv":
      answer(callbackId);
      await sendProjectCards(chatId, project.id);
      return { ok: true };

    case "aa": {
      const { approved } = await approveAll(owner, project.id);
      answer(callbackId, approved ? `Approved ${approved}` : "Already approved");
      const rendering = await renderAll(owner, project.id);
      say(
        chatId,
        rendering
          ? `✅ Approved. Rendering ${rendering} video${rendering > 1 ? "s" : ""} now — each one arrives here when ready.`
          : "✅ Approved. All videos are already rendered or rendering.",
      );
      if (!ScheduleSchema.safeParse(project.schedule).success && project.status === "draft") await askAutomation(chatId, project.id);
      return { ok: true };
    }

    case "rc":
      await setState(link, { awaiting: "revise" });
      answer(callbackId);
      say(
        chatId,
        "Tell me what to change. Mention numbers like <i>#2</i> for specific content, e.g. <i>“make #2 funnier and #3 shorter”</i>.",
      );
      return { ok: true };

    case "ra": {
      const n = await renderAll(owner, project.id);
      answer(callbackId, n ? `Rendering ${n}` : "Nothing new to render");
      if (n) say(chatId, `🎬 Rendering ${n} video${n > 1 ? "s" : ""} — they'll arrive here one by one.`);
      return { ok: true };
    }

    case "sc": {
      const preset = SCHEDULE_PRESETS[extra ?? ""];
      if (!preset) throw new AppError("VALIDATION_ERROR", "Unknown schedule", 400);
      const { data: profile } = await admin().from("profiles").select("timezone").eq("id", owner).maybeSingle();
      const tz = profile?.timezone ?? "Asia/Jakarta";
      await saveSchedule(owner, project.id, { timezone: tz, days: preset.days, time: preset.time, startDate: todayIn(tz) });
      answer(callbackId, "Schedule saved");
      return offerActivation(owner, chatId, project.id, `📅 Publishing ${describeSchedule({ days: preset.days, time: preset.time })} (${tz}).`);
    }

    case "nd":
      answer(callbackId, "No publishing");
      say(chatId, "📥 Got it — no publishing. Videos arrive here as they finish; you can schedule later with /schedule.", [
        [{ text: "💡 Suggest new ideas weekly", data: `id:${project.id}:on` }],
      ]);
      return { ok: true };

    case "id":
      await updateAutomation(owner, project.id, { ideationEnabled: extra === "on", everyDays: 7 });
      answer(callbackId, extra === "on" ? "Weekly ideas on" : "Ideas off");
      say(chatId, extra === "on" ? "💡 I'll draft 3 new ideas every week for your approval." : "Recurring ideas are off.");
      return { ok: true };

    case "ac": {
      try {
        await activateProject(owner, project.id);
      } catch (e) {
        if (e instanceof AppError && e.code === "NOT_READY") {
          const missing = ((e.details as { missing?: string[] })?.missing ?? []).join(", ");
          answer(callbackId, "Not ready yet");
          say(chatId, `Almost there — still needed: ${esc(missing)}.`, [
            [{ text: "🔗 Connect YouTube", url: `${appUrl()}/settings?section=connections` }],
            [{ text: "🚀 Try again", data: `ac:${project.id}` }],
          ]);
          return { ok: false };
        }
        throw e;
      }
      answer(callbackId, "Activated");
      say(chatId, `🚀 <b>${esc(project.title)}</b> is active. Videos upload to YouTube at each scheduled time — I'll send the links.`, [
        [{ text: "💡 Weekly new ideas", data: `id:${project.id}:on` }],
        [open(`/publishing`)],
      ]);
      return { ok: true };
    }
  }
  answer(callbackId);
  return { ok: false, unknown: code };
}

async function offerActivation(owner: string, chatId: number, projectId: string, intro: string) {
  const { data: yt } = await admin()
    .from("connected_accounts")
    .select("id")
    .eq("owner_id", owner)
    .eq("platform", "youtube")
    .eq("status", "connected")
    .maybeSingle();
  say(
    chatId,
    `${esc(intro)}\n${yt ? "Activate to start publishing on that schedule." : "Connect YouTube in Studio, then activate."}`,
    [
      ...(yt ? [] : [[{ text: "🔗 Connect YouTube", url: `${appUrl()}/settings?section=connections` }]]),
      [{ text: "🚀 Activate publishing", data: `ac:${projectId}` }],
    ],
  );
  return { ok: true };
}
