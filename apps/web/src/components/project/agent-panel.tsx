"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Send, Sparkles, X } from "lucide-react";
import { api } from "@/lib/client/api";
import { Spinner } from "@/components/ui/spinner";
import type { MessageRow } from "@/lib/server/rows";
import { useAgentFrame } from "./workspace-frame";

export function AgentPanel({
  projectId,
  projectTitle,
  messages,
  onClose,
  actions,
  thinking,
  placeholder,
}: {
  projectId: string;
  projectTitle: string;
  messages: MessageRow[];
  onClose?: () => void;
  actions?: React.ReactNode;
  /** The agent is working (setup stages): show the typing bubble. */
  thinking?: boolean;
  placeholder?: string;
}) {
  const router = useRouter();
  const frame = useAgentFrame();
  const input = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const log = useRef<HTMLDivElement>(null);
  const lastIsUser = messages.at(-1)?.role === "user";
  // Optimistic bubble disappears once the realtime refresh brings the real one.
  const showPending = pendingText && !messages.some((m) => m.role === "user" && m.content === pendingText) ? pendingText : null;

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, showPending, thinking]);

  // Other parts of the page pre-fill the chat ("Refine concept", "Scene 3"…).
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
    if (!content) return;
    if (!text) setDraft("");
    setPendingText(content);
    setError(null);
    start(async () => {
      try {
        await api(`/api/projects/${projectId}/messages`, "POST", { content });
      } catch (e) {
        setPendingText(null);
        setError(e instanceof Error ? e.message : "Could not send");
      }
    });
  }

  function similar(action: "use_similar" | "start_new", targetId?: string) {
    setError(null);
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
    <aside className="agent-panel">
      <div className="agent-head row between">
        <div className="row">
          <span className="iconTile"><Sparkles size={16} /></span>
          <div><div className="small semibold">Creative Agent</div><div className="tiny muted">Context: {projectTitle}</div></div>
        </div>
        {(onClose ?? frame?.hide) && (
          <button className="btn ghost small agent-hide" onClick={onClose ?? frame?.hide} aria-label="Hide agent"><X size={13} /> Hide</button>
        )}
      </div>
      <div className="chatlog" ref={log}>
        {messages.map((m, i) => {
          const last = i === messages.length - 1;
          return (
            <div key={m.id} className="stack" style={{ gap: 7 }}>
              <div className={`bubble ${m.role === "user" ? "user" : "agent"}`}>{m.content}</div>
              {last && m.role === "assistant" && m.meta?.similar && !thinking && (
                <div className="similar-card">
                  <div className="xs muted">Similar project</div>
                  <div className="small semibold">{m.meta.similar.title}</div>
                  <div className="actions" style={{ gap: 6, marginTop: 8 }}>
                    <button className="btn small primary" disabled={busy} onClick={() => similar("use_similar", m.meta!.similar!.projectId)}>Continue there</button>
                    <button className="btn small soft" disabled={busy} onClick={() => similar("start_new")}>Create a different project</button>
                    <Link className="btn small ghost" href={`/projects/${m.meta.similar.projectId}`} target="_blank">View</Link>
                  </div>
                </div>
              )}
              {last && m.role === "assistant" && !!m.meta?.chips?.length && !thinking && !showPending && (
                <div className="chips">
                  {m.meta.chips.map((c) => (
                    <button key={c} className="chip" disabled={busy} onClick={() => send(c)}>{c}</button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {showPending && <div className="bubble user" style={{ opacity: 0.7 }}>{showPending}</div>}
        {(busy || showPending || lastIsUser || thinking) && <div className="bubble agent pulse">Thinking…</div>}
      </div>
      {actions}
      <div className="chatfoot">
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
            placeholder={placeholder ?? "Ask anything, or say “make #2 funnier”…"}
          />
          <div className="row between">
            <span className="tiny faint">Project-linked conversation</span>
            <button className="btn primary small" onClick={() => send()} disabled={!draft.trim() || busy} aria-label="Send">{busy ? <Spinner size={13} /> : <Send size={13} />}</button>
          </div>
        </div>
        {error && <div className="err">{error}</div>}
      </div>
    </aside>
  );
}
