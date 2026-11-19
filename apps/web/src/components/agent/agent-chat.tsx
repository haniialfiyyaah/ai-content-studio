"use client";

import Link from "next/link";
import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  projectId?: string | null;
}

interface AgentMessageResponse {
  requestId: string;
  status: "ok" | "accepted" | "error";
  data: {
    conversationId: string;
    runId: string | null;
    projectId: string | null;
    messageId: string;
    assistantReply?: string | null;
  } | null;
  error: { code: string; message: string } | null;
}

/**
 * Creative Agent chat surface — posts to /api/agent/messages and
 * surfaces draft Project links when planning succeeds.
 */
export function AgentChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!content || loading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/agent/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          conversationId,
          projectId: projectId ?? undefined,
          sourceSurface: "web",
        }),
      });

      const json = (await res.json()) as AgentMessageResponse;

      if (!res.ok || json.status === "error" || !json.data) {
        setError(json.error?.message ?? "Unable to send message");
        return;
      }

      setConversationId(json.data.conversationId);
      let nextProjectId = json.data.projectId;
      if (!nextProjectId && json.status === "accepted" && json.data.runId) {
        nextProjectId = await waitForProject(json.data.runId);
      }
      if (nextProjectId) {
        setProjectId(nextProjectId);
      }

      const assistantContent =
        json.data.assistantReply?.trim() ||
        buildFallbackReply(json.status, nextProjectId);

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: assistantContent,
          projectId: nextProjectId,
        },
      ]);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="mx-auto flex h-[calc(100vh-7rem)] w-full max-w-3xl flex-col gap-4">
      <header className="shrink-0">
        <p className="text-sm font-medium uppercase tracking-[0.16em] text-accent">
          Creative Agent
        </p>
        <h1 className="font-display mt-2 text-3xl tracking-tight md:text-4xl">
          Plan with the shared agent
        </h1>
        <p className="mt-2 text-sm text-muted">
          Describe an idea. Actionable prompts open a Draft Project you can refine
          and activate.
        </p>
      </header>

      <div className="studio-panel flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          className="flex-1 space-y-4 overflow-y-auto px-4 py-5 md:px-6"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
        >
          {isEmpty && !loading ? (
            <EmptyState
              onPick={(prompt) => {
                setInput(prompt);
                textareaRef.current?.focus();
              }}
            />
          ) : (
            messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))
          )}

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-accent-soft/60 px-4 py-3 text-sm text-muted">
                Thinking…
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={onSubmit}
          className="shrink-0 border-t border-border bg-surface-strong/80 px-4 py-4 md:px-6"
        >
          {error && (
            <p
              className="mb-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {error}
            </p>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="sr-only" htmlFor="agent-message">
              Message
            </label>
            <textarea
              ref={textareaRef}
              id="agent-message"
              rows={3}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="e.g. Create a short product launch video series for a tea brand…"
              disabled={loading}
              className="min-h-[5.5rem] w-full flex-1 resize-none rounded-xl border border-border bg-surface-strong px-3.5 py-3 text-sm text-foreground placeholder:text-muted studio-focus-ring disabled:opacity-60"
            />
            <Button
              type="submit"
              size="lg"
              disabled={loading || !input.trim()}
              className="sm:mb-0.5"
            >
              {loading ? "Sending…" : "Send"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted">
            Enter to send · Shift+Enter for a new line
          </p>
        </form>
      </div>
    </div>
  );
}

function buildFallbackReply(
  status: "ok" | "accepted",
  nextProjectId: string | null,
): string {
  if (nextProjectId) {
    return "I've opened a Draft Project from your idea. Open it to refine the brief, Creative Kit, and next steps.";
  }
  if (status === "accepted") {
    return "Got it — planning is underway. I'll update this conversation when the draft is ready.";
  }
  return "Tell me what you want to create — a campaign theme, product story, or series — and I'll open a Draft Project.";
}

async function waitForProject(runId: string): Promise<string | null> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const res = await fetch(`/api/agent/runs/${runId}`);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { projectId?: string | null; status?: string };
    };
    if (json.data?.projectId) return json.data.projectId;
    if (json.data?.status === "failed") return null;
  }
  return null;
}

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  const starters = [
    "Plan a 5-part short-form series for a sustainable skincare launch",
    "Draft a brand-safe concept for a coffee subscription holiday push",
    "Help me outline an educational video kit about home gardening",
  ];

  return (
    <div className="flex h-full flex-col items-center justify-center px-2 py-10 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <span className="font-display text-2xl" aria-hidden>
          ✦
        </span>
      </div>
      <h2 className="font-display text-2xl tracking-tight">
        What should we make first?
      </h2>
      <p className="mt-2 max-w-md text-sm text-muted">
        Share a product, audience, or vibe. The agent will propose a Draft
        Project you can edit before anything is activated or published.
      </p>
      <ul className="mt-8 flex w-full max-w-lg flex-col gap-2">
        {starters.map((prompt) => (
          <li key={prompt}>
            <button
              type="button"
              onClick={() => onPick(prompt)}
              className="w-full rounded-xl border border-border bg-surface-strong px-4 py-3 text-left text-sm transition hover:border-accent/40 hover:bg-white studio-focus-ring"
            >
              {prompt}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "bg-accent text-accent-foreground"
            : "border border-border bg-surface-strong text-foreground",
        )}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        {!isUser && message.projectId && (
          <Link
            href={`/projects/${message.projectId}`}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent transition hover:brightness-95"
          >
            Open Draft Project
            <span aria-hidden>→</span>
          </Link>
        )}
      </div>
    </div>
  );
}
