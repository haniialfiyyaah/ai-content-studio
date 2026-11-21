"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowRight, Check, Pencil, RotateCcw, Send, Sparkles } from "lucide-react";
import {
  CTA_LABELS,
  SETUP_STAGES,
  SETUP_STAGE_LABELS,
  parseEnding,
  type SetupStage,
} from "@acs/domain";
import { api } from "@/lib/client/api";
import { compose } from "@/lib/client/compose";
import { Spinner } from "@/components/ui/spinner";
import type { MessageRow } from "@/lib/server/rows";

const STEPS = SETUP_STAGES.filter((s) => s !== "done");

const BUSY_TEXT: Record<SetupStage, string> = {
  discovery: "Thinking…",
  concept: "Sketching the concept…",
  kit: "Building the Creative Kit…",
  pillars: "Writing pillars and guardrails…",
  done: "Drafting your first content…",
};

const NEXT_LABEL: Partial<Record<SetupStage, string>> = {
  concept: "Continue to Creative Kit",
  kit: "Continue to pillars",
  pillars: "Lock setup & draft content",
};

type Data = Record<string, unknown>;
const str = (d: Data, k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
const list = (d: Data, k: string) => (Array.isArray(d[k]) ? (d[k] as string[]) : []);

/**
 * Full-page setup conversation (docs/FLOW.md). Stage results arrive as cards
 * inside the chat; every button press is posted as a chat message too.
 */
export function SetupChat({
  projectId,
  title,
  stage,
  busy,
  stale,
  messages,
}: {
  projectId: string;
  title: string;
  stage: SetupStage;
  busy: boolean;
  stale: boolean;
  messages: MessageRow[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, start] = useTransition();
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const at = STEPS.indexOf(stage as (typeof STEPS)[number]);
  const working = busy && !stale;
  const lastIsUser = messages.at(-1)?.role === "user";
  const showPending = pendingText && !messages.some((m) => m.role === "user" && m.content === pendingText) ? pendingText : null;
  const thinking = working || sending || Boolean(showPending) || (lastIsUser && !stale);
  // The newest card of the current stage is the one you act on.
  const activeCardId = [...messages].reverse().find((m) => m.role === "assistant" && m.meta?.stage === stage && m.meta?.data)?.id;
  const last = messages.at(-1);
  const pendingSimilar = last?.role === "assistant" && last.meta?.similar && !thinking ? last.meta.similar : null;
  const needRetry = stale || (!busy && !lastIsUser && stage !== "discovery" && !activeCardId);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, showPending, thinking]);

  useEffect(() => {
    const onCompose = (e: Event) => {
      const text = (e as CustomEvent<string>).detail ?? "";
      setDraft(text);
      requestAnimationFrame(() => {
        input.current?.focus();
        input.current?.setSelectionRange(text.length, text.length);
      });
    };
    window.addEventListener("acs:compose", onCompose);
    return () => window.removeEventListener("acs:compose", onCompose);
  }, []);

  function send(text?: string) {
    const content = (text ?? draft).trim();
    if (!content || thinking) return;
    if (!text) setDraft("");
    setPendingText(content);
    setError(null);
    start(async () => {
      try {
        await api(`/api/projects/${projectId}/messages`, "POST", { content });
        router.refresh();
      } catch (e) {
        setPendingText(null);
        setError(e instanceof Error ? e.message : "Could not send");
      }
    });
  }

  function act(action: "continue" | "retry" | "start_new" | "use_similar", targetId?: string) {
    setError(null);
    if (action === "continue" && stage === "pillars") {
      // The workspace opens with the chat sliding to the side (WorkspaceFrame).
      try { sessionStorage.setItem(`acs.splitIn.${projectId}`, "1"); } catch {}
    }
    start(async () => {
      try {
        const r = await api<{ redirect?: string }>(`/api/projects/${projectId}/setup`, "POST", { action, targetId });
        if (r.redirect) router.push(r.redirect);
        else router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="setup-chat">
      <div className="setup-top">
        <div className="row" style={{ gap: 10, minWidth: 0 }}>
          <span className="iconTile"><Sparkles size={16} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="tiny muted">NEW PROJECT</div>
            <div className="small semibold ellipsis">{title}</div>
          </div>
        </div>
        <div className="setup-steps">
          {STEPS.map((s, i) => (
            <div key={s} className={`setup-step ${i < at ? "done" : i === at ? "active" : ""}`}>
              <span className="setup-dot">{i < at ? <Check size={11} /> : i + 1}</span>
              <span className="setup-step-label">{SETUP_STAGE_LABELS[s]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="setup-log" ref={log}>
        <div className="setup-col">
          {messages.map((m, i) => {
            const isLast = i === messages.length - 1;
            const card = m.role === "assistant" && m.meta?.stage && m.meta.data ? m.meta : null;
            const active = m.id === activeCardId && !thinking;
            return (
              <div key={m.id} className="stack" style={{ gap: 8 }}>
                <div className={`bubble ${m.role === "user" ? "user" : "agent"} big`}>{m.content}</div>
                {card && (
                  <StageCard stage={card.stage!} data={card.data!} active={active} old={m.id !== activeCardId} />
                )}
                {active && NEXT_LABEL[stage] && (
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <button className="btn primary" disabled={sending} onClick={() => act("continue")}>
                      {NEXT_LABEL[stage]} <ArrowRight size={14} />
                    </button>
                    <span className="xs muted">or tap ✏️ on any field to change it</span>
                  </div>
                )}
                {isLast && pendingSimilar && (
                  <div className="similar-card">
                    <div className="xs muted">Similar project</div>
                    <div className="small semibold">{pendingSimilar.title}</div>
                    <div className="actions" style={{ gap: 6, marginTop: 8 }}>
                      <button className="btn small primary" disabled={sending} onClick={() => act("use_similar", pendingSimilar.projectId)}>Continue there</button>
                      <button className="btn small soft" disabled={sending} onClick={() => act("start_new")}>Start a new project</button>
                      <Link className="btn small ghost" href={`/projects/${pendingSimilar.projectId}`} target="_blank">View it</Link>
                    </div>
                  </div>
                )}
                {isLast && m.role === "assistant" && !pendingSimilar && !!m.meta?.chips?.length && !thinking && (
                  <div className="chips">
                    {m.meta.chips.map((c) => (
                      <button key={c} className="chip" onClick={() => send(c)}>{c}</button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {showPending && <div className="bubble user big" style={{ opacity: 0.7 }}>{showPending}</div>}
          {thinking && (
            <div className="bubble agent big typing">
              <span className="dots"><i /><i /><i /></span> {BUSY_TEXT[stage]}
            </div>
          )}
          {needRetry && !thinking && (
            <div className="note amber row" style={{ gap: 10 }}>
              {stale ? "The agent didn’t answer in time." : "That step didn’t finish."}
              <button className="btn small" disabled={sending} onClick={() => act("retry")}><RotateCcw size={12} /> Retry</button>
            </div>
          )}
        </div>
      </div>

      <div className="setup-compose">
        <div className="setup-col">
          <div className="chatinput">
            <textarea
              ref={input}
              id="agent-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={pendingSimilar ? "Or tell me which way you want to go…" : "Reply to the agent…"}
            />
            <div className="row between">
              <span className="tiny faint">Nothing is generated until you agree on the setup.</span>
              <button className="btn primary small" onClick={() => send()} disabled={!draft.trim() || thinking} aria-label="Send">
                {sending ? <Spinner size={13} /> : <Send size={13} />}
              </button>
            </div>
          </div>
          {error && <div className="err">{error}</div>}
        </div>
      </div>
    </div>
  );
}

/** A stage result inside the chat. ✏️ on a field pre-fills "Change the <field>: ". */
function StageCard({ stage, data, active, old }: { stage: SetupStage; data: Data; active: boolean; old: boolean }) {
  return (
    <div className={`card setup-card-chat ${old ? "old" : ""}`}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>{SETUP_STAGE_LABELS[stage]}{old ? " · earlier version" : ""}</div>
      {stage === "concept" && (
        <>
          <div className="setup-title">{str(data, "emoji")} {str(data, "title")}</div>
          {str(data, "summary") && <p className="small muted line">{str(data, "summary")}</p>}
          <div className="setup-grid">
            <F active={active} label="Niche" value={str(data, "niche")} />
            <F active={active} label="Audience" value={str(data, "audience")} />
            <F active={active} label="Goal" value={str(data, "goal")} />
            <F active={active} label="Content language" value={str(data, "language")} />
          </div>
        </>
      )}
      {stage === "kit" && (
        <div className="setup-grid">
          <F active={active} label="Tone" value={str(data, "tone")} />
          <F active={active} label="Format" value={str(data, "format")} />
          <F active={active} label="Narrator voice" value={str(data, "voice")} wide />
          <F active={active} label="Visual style" value={str(data, "visualStyle")} wide />
          <F active={active} label="Palette" value={str(data, "palette")}><Swatches palette={str(data, "palette")} /></F>
          <F active={active} label="Recurring character" value={str(data, "recurringSubject") || "None (abstract visuals)"} />
          <F active={active} label="Opening" value={str(data, "opening")} />
          <F active={active} label="Ending" value={endingText(data.ending)} />
        </div>
      )}
      {stage === "pillars" && (
        <div className="setup-grid">
          <Points active={active} label="Pillars" items={list(data, "pillars")} />
          <Points active={active} label="Guardrails" items={list(data, "guardrails")} />
        </div>
      )}
    </div>
  );
}

function EditBtn({ text, title, size = 11 }: { text: string; title: string; size?: number }) {
  return (
    <button className="icbtn tinybtn" title={title} onClick={() => compose(text)}>
      <Pencil size={size} />
    </button>
  );
}

function F({ label, value, wide, active, children }: { label: string; value: string; wide?: boolean; active: boolean; children?: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className={`setup-field ${wide ? "wide" : ""}`}>
      <div className="row between" style={{ gap: 6 }}>
        <label>{label}</label>
        {active && <EditBtn title={`Change the ${label.toLowerCase()}`} text={`Change the ${label.toLowerCase()}: `} />}
      </div>
      <div className="small line">{value}</div>
      {children}
    </div>
  );
}

function Points({ label, items, active }: { label: string; items: string[]; active: boolean }) {
  return (
    <div className="setup-field wide">
      <div className="row between" style={{ gap: 6 }}>
        <label>{label}</label>
        {active && <EditBtn title={`Change the ${label.toLowerCase()}`} text={`Change the ${label.toLowerCase()}: `} />}
      </div>
      <ul className="setup-points">
        {items.map((x, i) => (
          <li key={i}>
            <span>{x}</span>
            {active && <EditBtn size={10} title="Change this point" text={`Change ${label.toLowerCase()} point ${i + 1} (“${x}”): `} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function endingText(raw: unknown) {
  const e = parseEnding(raw);
  return `${CTA_LABELS[e.cta].label}${e.series ? " · teases the next video" : ""}`;
}

function Swatches({ palette }: { palette: string }) {
  const hex = palette.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi) ?? [];
  if (!hex.length) return null;
  return (
    <div className="row" style={{ gap: 6, marginTop: 8 }}>
      {hex.slice(0, 6).map((h) => <span key={h} className="swatch" style={{ background: h }} title={h} />)}
    </div>
  );
}
