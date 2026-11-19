"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FormEvent,
  KeyboardEvent,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { ArrowRight, ArrowUp, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { RunProgress } from "./run-progress";
import { usePlanningRun } from "./use-planning-run";

export interface ThreadMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  projectId?: string | null;
}

interface AgentMessageResponse {
  status: "ok" | "accepted" | "error";
  data: {
    conversationId: string;
    runId: string | null;
    projectId: string | null;
    assistantReply?: string | null;
  } | null;
  error: { message: string } | null;
}

const STARTERS = [
  "A weekly channel explaining databases",
  "Short story series about my cat",
  "One video for a single product",
] as const;

/**
 * Studio home: the persisted agent conversation, with the creator's pending
 * decisions rendered at the end of the thread. Sending continues the same
 * conversation and refreshes the server-rendered decisions.
 */
export function StudioThread({
  initialMessages,
  initialConversationId,
  decisions,
}: {
  initialMessages: ThreadMessage[];
  initialConversationId: string | null;
  decisions: ReactNode;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [syncedMessages, setSyncedMessages] = useState(initialMessages);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { run, follow, clear } = usePlanningRun();
  const logRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // A server refresh brings the persisted thread (including the agent's reply); adopt it.
  if (initialMessages !== syncedMessages) {
    setSyncedMessages(initialMessages);
    setMessages(initialMessages);
  }

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages.length, loading, run?.events.length]);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const content = input.trim();
    if (!content || loading) return;

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      },
    ]);
    setInput("");
    setError(null);
    clear();
    setLoading(true);

    try {
      const res = await fetch("/api/agent/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          conversationId: conversationId ?? undefined,
          sourceSurface: "web",
        }),
      });
      const json = (await res.json()) as AgentMessageResponse;
      if (!res.ok || json.status === "error" || !json.data) {
        setError(json.error?.message ?? "The agent could not take that message.");
        return;
      }

      setConversationId(json.data.conversationId);

      if (json.status === "accepted" && json.data.runId) {
        // The run card shows each step; the reply arrives with the refreshed thread.
        await follow(json.data.runId);
        router.refresh();
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            json.data?.assistantReply?.trim() ||
            (json.data?.projectId
              ? "Noted on this Project's conversation."
              : "Tell me what to make, like a weekly series or a single product video, and I'll draft a Project for you."),
          createdAt: new Date().toISOString(),
          projectId: json.data?.projectId,
        },
      ]);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
      textRef.current?.focus();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  return (
    <section className="home-thread" aria-labelledby="studio-heading">
      <header className="home-head">
        <h1 id="studio-heading">Studio</h1>
        <p>Tell the agent what to make. Every approval stays your call.</p>
      </header>

      <div
        ref={logRef}
        className="home-log"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        <div className="home-log-inner">
          {messages.map((message) => (
            <Message key={message.id} message={message} />
          ))}
          {run ? <RunProgress run={run} /> : null}
          {loading && !run ? (
            <div className="msg">
              <span className="msg-avatar" aria-hidden>
                <Sparkles className="size-4" />
              </span>
              <div className="bubble bubble--agent thinking" aria-label="Agent is thinking">
                <span />
                <span />
                <span />
              </div>
            </div>
          ) : null}
          {decisions}
        </div>
      </div>

      <form className="home-composer" onSubmit={(event) => void send(event)}>
        <div className="home-composer-inner">
          {error ? (
            <p className="composer-error" role="alert">
              {error}
            </p>
          ) : null}
          {messages.length === 0 ? (
            <div className="composer-chips">
              {STARTERS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="composer-chip"
                  onClick={() => {
                    setInput(prompt);
                    textRef.current?.focus();
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          ) : null}
          <div className="composer-box">
            <label className="sr-only" htmlFor="studio-message">
              Message the agent
            </label>
            <textarea
              ref={textRef}
              id="studio-message"
              rows={1}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Tell the agent what to make or change…"
              className="composer-text"
              disabled={loading}
            />
            <button
              type="submit"
              className="composer-send"
              disabled={loading || input.trim().length === 0}
              aria-label="Send"
            >
              <ArrowUp className="size-5" aria-hidden />
            </button>
          </div>
          <p className="composer-foot">
            Enter to send, Shift and Enter for a new line. Review content before publishing.
          </p>
        </div>
      </form>
    </section>
  );
}

function Message({ message }: { message: ThreadMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("msg", isUser && "msg--user")}>
      {!isUser ? (
        <span className="msg-avatar" aria-hidden>
          <Sparkles className="size-4" />
        </span>
      ) : null}
      <div className="msg-body">
        <span className="sr-only">{isUser ? "You said" : "Agent said"}</span>
        <div className={cn("bubble", isUser ? "bubble--user" : "bubble--agent")}>
          {message.content}
        </div>
        {!isUser && message.projectId ? (
          <Link href={`/projects/${message.projectId}`} className="msg-link">
            Open Project
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : null}
        <time className="msg-time mono" dateTime={message.createdAt}>
          {formatTime(message.createdAt)}
        </time>
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}