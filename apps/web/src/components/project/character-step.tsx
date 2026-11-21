"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ImagePlus, X } from "lucide-react";
import { MascotScene, type MascotAction, type MascotSpec } from "@acs/mascot";
import { VISUAL_SOURCE_LABELS, type VisualSource } from "@acs/domain";
import { api } from "@/lib/client/api";
import { compose } from "@/lib/client/compose";
import { ACCEPT, uploadReference } from "@/lib/client/upload";
import { Spinner } from "@/components/ui/spinner";

export interface RefAsset {
  id: string;
  label: string;
  url: string | null;
}

/** A few poses so the creator sees the mascot as a character, not a logo. */
const PREVIEW: MascotAction[] = [
  { pose: "wave", expression: "happy", prop: "", setting: "room" },
  { pose: "hold", expression: "excited", prop: "💡", setting: "plain" },
  { pose: "think", expression: "thinking", prop: "", setting: "desk" },
];

/**
 * Last project-setup step: the project character (AI sheet and/or the
 * code-drawn mascot) and the creator's own reference images. Click the
 * character to change it in the chat.
 */
export function CharacterStep({
  projectId,
  visualSource,
  description,
  mascot,
  palette,
  sheetUrl,
  refs,
  editable,
}: {
  projectId: string;
  visualSource: VisualSource;
  description: string;
  mascot: MascotSpec | null;
  palette: string[];
  /** the AI character sheet (null while it's being drawn) */
  sheetUrl: string | null;
  refs: RefAsset[];
  editable: boolean;
}) {
  const router = useRouter();
  const picker = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ai = visualSource !== "mascot";
  const drawsMascot = visualSource !== "ai";
  const change = () => editable && compose("Change the character: ");

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    for (const [i, f] of Array.from(files).slice(0, 6).entries()) {
      setUploading(`Uploading ${i + 1} of ${Math.min(files.length, 6)}…`);
      await uploadReference(projectId, f).catch(() => undefined);
    }
    setUploading(null);
    router.refresh();
  }
  const remove = (id: string) =>
    start(async () => {
      await api(`/api/assets/${id}`, "DELETE").catch(() => undefined);
      router.refresh();
    });

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="xs muted">Visuals: <strong>{VISUAL_SOURCE_LABELS[visualSource].label}</strong> — {VISUAL_SOURCE_LABELS[visualSource].help}</div>

      <div
        className={`setup-field wide ${editable ? "clickable-card" : ""}`}
        title={editable ? "Click to change the character" : undefined}
        onClick={change}
      >
        <label>Character</label>
        <div className="small line">{description || "No recurring character — abstract visuals."}</div>
      </div>

      <div className="char-row">
        {ai && (
          <figure className={`char-card ${editable ? "clickable-card" : ""}`} onClick={change} title={editable ? "Click to change the character" : undefined}>
            <div className="char-img">
              {sheetUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sheetUrl} alt="AI character sheet" />
              ) : (
                <span className="sb-loading"><Spinner size={16} /> drawing the character…</span>
              )}
            </div>
            <figcaption className="xs muted">AI character — keeps every AI scene consistent</figcaption>
          </figure>
        )}
        {drawsMascot && mascot &&
          PREVIEW.map((a, i) => (
            <figure key={i} className={`char-card ${editable ? "clickable-card" : ""}`} onClick={change} title={editable ? "Click to change the mascot" : undefined}>
              <MascotScene spec={mascot} action={a} palette={palette} className="char-img" />
              {i === 0 && <figcaption className="xs muted">Mascot — drawn by code, free</figcaption>}
            </figure>
          ))}
      </div>

      <div className="setup-field wide">
        <label>Your references (optional)</label>
        <div className="xs muted" style={{ marginBottom: 8 }}>Product photos, your face, a logo or a background — the AI scenes follow them.</div>
        <div className="ref-grid">
          {refs.map((r) => (
            <div key={r.id} className="ref-item">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {r.url ? <img src={r.url} alt={r.label} /> : <span />}
              <span className="tiny ref-label">{r.label}</span>
              {editable && (
                <button className="icbtn tinybtn ref-x" aria-label={`Remove ${r.label}`} disabled={pending} onClick={() => remove(r.id)}><X size={11} /></button>
              )}
            </div>
          ))}
          {editable && (
            <button className="ref-add" disabled={Boolean(uploading)} onClick={() => picker.current?.click()}>
              {uploading ? <><Spinner size={13} /> <span className="tiny">{uploading}</span></> : <><ImagePlus size={18} /><span className="tiny">Add image</span></>}
            </button>
          )}
        </div>
        <input ref={picker} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
      </div>
    </div>
  );
}
