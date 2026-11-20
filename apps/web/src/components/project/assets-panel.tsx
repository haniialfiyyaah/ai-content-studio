"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { VISUAL_MODES, VISUAL_MODE_LABELS, type VisualMode } from "@acs/domain";
import { api } from "@/lib/client/api";
import { ACCEPT, uploadReference } from "@/lib/client/upload";

const MODE_HELP: Record<VisualMode, string> = {
  ai: "Every scene image is generated in the Creative Kit's art style.",
  ai_with_references: "Scenes are generated from your references — keeps products and characters consistent.",
  references: "Your uploads are used directly as the scene images (animated with zoom, captions and transitions).",
};

export function AssetsPanel({
  projectId,
  mode,
  assets,
  editable,
}: {
  projectId: string;
  mode: VisualMode;
  assets: { id: string; label: string; url: string | null }[];
  editable: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    start(async () => {
      try {
        const list = Array.from(files);
        for (const [i, f] of list.entries()) {
          setStatus(`Uploading ${i + 1} of ${list.length}…`);
          await uploadReference(projectId, f);
        }
        setStatus(null);
        router.refresh();
      } catch (e) {
        setStatus(null);
        setError(e instanceof Error ? e.message : "Upload failed");
      }
    });
  }

  function run(fn: () => Promise<unknown>) {
    setError(null);
    start(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: "minmax(0,1.4fr) minmax(260px,.8fr)" }}>
      <div className="card pad">
        <div className="section">
          <div><h2>References</h2><p>Product photos, characters, logos or style examples (JPG/PNG/WebP, up to 10 MB).</p></div>
          {editable && (
            <>
              <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
              <button className="btn primary" disabled={pending} onClick={() => input.current?.click()}><ImagePlus size={14} /> Upload</button>
            </>
          )}
        </div>
        {status && <div className="note pulse" style={{ marginBottom: 12 }}>{status}</div>}
        {error && <div className="err" style={{ marginBottom: 12 }}>{error}</div>}
        {assets.length ? (
          <div className="assetcards">
            {assets.map((a, i) => (
              <div key={a.id} className="assetcard">
                <div className="assetvisual" style={{ padding: 0, overflow: "hidden" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {a.url ? <img src={a.url} alt={a.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "🖼️"}
                </div>
                <div className="row between" style={{ padding: "10px 5px 2px" }}>
                  <div style={{ minWidth: 0 }}><div className="small semibold" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label || `Reference ${i + 1}`}</div><div className="tiny faint">#{i + 1}</div></div>
                  {editable && <button className="icbtn" aria-label="Remove reference" disabled={pending} onClick={() => run(() => api(`/api/assets/${a.id}`, "DELETE"))}><Trash2 size={14} /></button>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>No references yet</h3>
            <p>Optional. Without references the agent generates every scene image in your project&apos;s art style.</p>
          </div>
        )}
      </div>
      <div className="card pad">
        <div className="section"><div><h2>Scene images</h2><p>How each scene&apos;s picture is made.</p></div></div>
        {VISUAL_MODES.map((m) => {
          const disabled = !editable || pending || (m !== "ai" && !assets.length);
          return (
            <label key={m} className={`ai-option ${mode === m ? "selected" : ""}`} style={{ opacity: disabled && mode !== m ? 0.55 : 1 }}>
              <input type="radio" name="visual-mode" checked={mode === m} disabled={disabled} onChange={() => run(() => api(`/api/projects/${projectId}/visual-mode`, "PATCH", { visualMode: m }))} />
              <div><div className="small semibold">{VISUAL_MODE_LABELS[m]}</div><div className="xs muted line">{MODE_HELP[m]}</div></div>
            </label>
          );
        })}
        <div className="note" style={{ marginTop: 14 }}>Applies to the next renders. Already-finished videos keep their images.</div>
      </div>
    </div>
  );
}
