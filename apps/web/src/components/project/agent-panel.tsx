"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Send, Sparkles, X } from "lucide-react";
import { api } from "@/lib/client/api";
import { Spinner } from "@/components/ui/spinner";
import type { MessageRow } from "@/lib/server/rows";

export function AgentPanel({
  projectId,
  projectTitle,
  messages,
  onClose,
}: {
  projectId: string;
  projectTitle: string;
  messages: MessageRow[];
  onClose?: () => void;
}) {
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
  }, [messages.length, showPending]);


  function send() {
    const content = draft.trim();
    if (!content) return;
    setDraft("");
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

  return (
    <aside className="agent-panel">
      <div className="agent-head row between">
        <div className="row">
          <span className="iconTile"><Sparkles size={16} /></span>
          <div><div className="small semibold">Creative Agent</div><div className="tiny muted">Context: {projectTitle}</div></div>
        </div>
        {onClose && <button className="icbtn" onClick={onClose} aria-label="Hide agent"><X size={15} /></button>}
      </div>
      <div className="chatlog" ref={log}>
        {messages.map((m) => (
          <div key={m.id} className={`bubble ${m.role === "user" ? "user" : "agent"}`}>{m.content}</div>
        ))}
        {showPending && <div className="bubble user" style={{ opacity: 0.7 }}>{showPending}</div>}
        {(busy || showPending || lastIsUser) && <div className="bubble agent pulse">Thinking…</div>}
      </div>
      <div className="chatfoot">
        <div className="chatinput">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask about this Project, or say “make 3 more ideas”…"
          />
          <div className="row between">
            <span className="tiny faint">Project-linked conversation</span>
            <button className="btn primary small" onClick={send} disabled={!draft.trim() || busy} aria-label="Send">{busy ? <Spinner size={13} /> : <Send size={13} />}</button>
          </div>
        </div>
        {error && <div className="err">{error}</div>}
      </div>
    </aside>
  );
}
