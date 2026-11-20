"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ImagePlus, Plus, Send, X } from "lucide-react";
import { api } from "@/lib/client/api";
import { Spinner } from "@/components/ui/spinner";
import { ACCEPT, uploadReference } from "@/lib/client/upload";

const QUICK = [
  "Affiliate videos for useful home products",
  "Weekly cat storytelling series for kids",
  "Coding tips explained in 30 seconds",
];

export function StartProject() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(0); // 0 = from the prompt (default 3)
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const picker = useRef<HTMLInputElement>(null);

  function submit() {
    if (!prompt.trim()) return;
    setError(null);
    start(async () => {
      try {
        const { projectId } = await api<{ projectId: string }>("/api/projects/start", "POST", {
          prompt,
          contentCount: count || undefined,
          deferGeneration: files.length > 0,
        });
        if (files.length) {
          // References first, so the agent can plan scenes around them.
          for (const [i, f] of files.entries()) {
            setStatus(`Uploading reference ${i + 1} of ${files.length}…`);
            await uploadReference(projectId, f).catch(() => undefined);
          }
          await api(`/api/projects/${projectId}/kick`, "POST");
        }
        router.push(`/projects/${projectId}`);
      } catch (e) {
        setStatus(null);
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
        {files.length > 0 && (
          <div className="tagrow" style={{ marginTop: 4 }}>
            {files.map((f, i) => (
              <span key={i} className="tag row" style={{ gap: 4 }}>
                {f.name.slice(0, 24)}
                <button className="icbtn" style={{ width: 18, height: 18, border: 0 }} aria-label="Remove" onClick={() => setFiles(files.filter((_, j) => j !== i))}><X size={11} /></button>
              </span>
            ))}
          </div>
        )}
        <div className="row between" style={{ marginTop: 8 }}>
          <input ref={picker} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 10)); e.target.value = ""; }} />
          <button type="button" className="btn ghost small" onClick={() => picker.current?.click()}><ImagePlus size={14} /> Add reference</button>
          <label className="row xs muted" style={{ gap: 6 }}>
            <Plus size={14} /> Content ideas
            <select className="option-select" style={{ width: 82, padding: "6px 26px 6px 10px" }} title="Auto = the number you mention in your idea (e.g. “1 video”), otherwise 3" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              <option value={0}>Auto</option>
              {[1, 2, 3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button className="btn primary" disabled={pending || !prompt.trim()} onClick={submit}>
            {pending ? <Spinner /> : <Send size={14} />} {pending ? status ?? "Creating project…" : "Send"}
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
