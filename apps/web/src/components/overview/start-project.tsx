"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ImagePlus, Send, X } from "lucide-react";
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
        const { projectId } = await api<{ projectId: string }>("/api/projects", "POST", { idea: prompt });
        if (files.length) {
          // References are attached to the project while the agent shapes the idea.
          for (const [i, f] of files.entries()) {
            setStatus(`Uploading reference ${i + 1} of ${files.length}…`);
            await uploadReference(projectId, f).catch(() => undefined);
          }
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
          <button className="btn primary" disabled={pending || !prompt.trim()} onClick={submit}>
            {pending ? <Spinner /> : <Send size={14} />} {pending ? status ?? "Starting…" : "Talk it through"}
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
