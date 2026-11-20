"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, Send } from "lucide-react";
import { api } from "@/lib/client/api";

const QUICK = [
  "Affiliate videos for useful home products",
  "Weekly cat storytelling series for kids",
  "Coding tips explained in 30 seconds",
];

export function StartProject() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(4);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    if (!prompt.trim()) return;
    setError(null);
    start(async () => {
      try {
        const { projectId } = await api<{ projectId: string }>("/api/projects/start", "POST", { prompt, contentCount: count });
        router.push(`/projects/${projectId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start");
      }
    });
  }

  return (
    <div id="create">
      <div className="heroform">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          placeholder="I want to create content about…"
          aria-label="Describe your content idea"
        />
        <div className="row between" style={{ marginTop: 8 }}>
          <label className="row xs muted" style={{ gap: 6 }}>
            <Plus size={14} /> Content ideas
            <select className="option-select" style={{ width: 70, padding: "6px 26px 6px 10px" }} value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[2, 3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button className="btn primary" disabled={pending || !prompt.trim()} onClick={submit}>
            <Send size={14} /> {pending ? "Starting…" : "Send"}
          </button>
        </div>
      </div>
      {error && <div className="err">{error}</div>}
      <div className="quickprompts">
        {QUICK.map((q) => (
          <button key={q} className="prompt" onClick={() => setPrompt(q)}>{q}</button>
        ))}
      </div>
    </div>
  );
}
