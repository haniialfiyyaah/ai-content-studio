"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, Check, SkipForward, X } from "lucide-react";
import { OPTION_FIELDS, type ContentOptions, type Selection } from "@acs/domain";
import { OptionPicker } from "@/components/content/option-picker";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/client/api";

export interface ReviewItem {
  id: string;
  n: number;
  status: "draft" | "approved" | "archived";
  options: Partial<ContentOptions>;
  selection: Selection;
  scenes: { heading: string; onScreenText?: string; layout?: string; narration?: string; headline?: string; background?: string; seconds?: number; visual?: string }[];
}

/**
 * One-by-one review: shows the current pending content with every option,
 * "Approve & next" jumps straight to the next pending one.
 */
export function ReviewFlow({
  projectId,
  items,
  currentId,
  images,
}: {
  projectId: string;
  items: ReviewItem[];
  currentId?: string;
  /** Storyboard images of the content under review (index = beat). */
  images?: { id: string; urls: (string | null)[]; drawing: boolean };
}) {
  const router = useRouter();
  const pending = items.filter((i) => i.status === "draft");
  const current = items.find((i) => i.id === currentId && i.status === "draft") ?? pending[0];
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [board, setBoard] = useState(false);
  const reviewed = items.length - pending.length;

  const go = (id: string | null) =>
    router.replace(`/projects/${projectId}?tab=content${id ? `&review=${id}` : ""}`, { scroll: false });

  function approveNext() {
    if (!current) return;
    setError(null);
    start(async () => {
      try {
        const { nextId } = await api<{ nextId: string | null }>(`/api/contents/${current.id}/approve`, "POST");
        go(nextId);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not approve");
      }
    });
  }

  function reject() {
    if (!current) return;
    setError(null);
    start(async () => {
      try {
        const { nextId } = await api<{ nextId: string | null }>(`/api/contents/${current.id}/reject`, "POST");
        go(nextId);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not reject");
      }
    });
  }

  function approveAll() {
    setError(null);
    start(async () => {
      try {
        await api(`/api/projects/${projectId}/approve-all`, "POST");
        go(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not approve");
      }
    });
  }

  if (!current) {
    return (
      <div className="card pad" style={{ textAlign: "center" }}>
        <div className="iconTile green" style={{ margin: "0 auto 10px" }}><Check size={17} /></div>
        <h2 style={{ fontSize: 18 }}>All {items.length} content approved 🎉</h2>
        <p className="small muted" style={{ margin: "8px auto 16px", maxWidth: 440 }}>Render the videos now, or set a schedule and activate to publish automatically.</p>
        <div className="actions" style={{ justifyContent: "center" }}>
          <Link className="btn soft" href={`/projects/${projectId}?tab=videos`}>🎬 Videos</Link>
          <Link className="btn primary" href={`/projects/${projectId}?tab=schedule`}>📅 Schedule</Link>
        </div>
      </div>
    );
  }

  const imgs = images?.id === current.id ? images : undefined;
  function drawImages() {
    setError(null);
    start(async () => {
      try {
        await api(`/api/contents/${current!.id}/storyboard`, "POST");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not draw images");
      }
    });
  }

  const nextPending = pending[pending.indexOf(current) + 1] ?? pending.find((p) => p.id !== current.id) ?? null;

  return (
    <div className="stack">
      <div className="card pad">
        <div className="row between" style={{ flexWrap: "wrap", gap: 10 }}>
          <div>
            <div className="eyebrow" style={{ margin: 0 }}>REVIEW · {reviewed} OF {items.length} APPROVED</div>
            <div className="progressbar" style={{ width: 220, marginTop: 8 }}><span style={{ width: `${(reviewed / items.length) * 100}%` }} /></div>
          </div>
          <div className="actions">
            {items.map((i) => (
              <button
                key={i.id}
                className={`daychip ${i.id === current.id ? "on" : ""}`}
                style={{ padding: "6px 10px" }}
                title={i.status === "approved" ? "Approved" : "Pending"}
                onClick={() => i.status === "draft" && go(i.id)}
                disabled={i.status !== "draft"}
              >
                #{i.n}{i.status === "approved" ? " ✓" : ""}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card pad">
        <div className="section">
          <div>
            <div className="eyebrow">CONTENT #{current.n} · {current.scenes.length} SCENES</div>
            <h2>{current.options.title?.[current.selection.title ?? 0]}</h2>
          </div>
          <button className={`btn small ${board ? "soft" : ""}`} onClick={() => setBoard((b) => !b)}>{board ? "Hide storyboard" : "🎞️ Storyboard"}</button>
        </div>
        {board && (
          <div className="storystrip">
            {current.scenes.map((s, i) => (
              <div
                key={i}
                className={`storyslide ${s.background === "design" ? "dark" : ["", "blue", "peach"][i % 3]} ${imgs?.urls[i] ? "hasimg" : ""}`}
                style={imgs?.urls[i] ? { backgroundImage: `linear-gradient(180deg,#0000 35%,#000a), url(${imgs.urls[i]})` } : undefined}
              >
                <div className="row between"><span className="tiny semibold">BEAT {i + 1}</span><span className="tiny">{s.seconds ?? 3}s · {s.layout ?? "image"}</span></div>
                <div className="storyhead">{s.headline || s.onScreenText || s.heading}</div>
                <div className="storynarr">“{s.narration}”</div>
                <div className="tiny storyfoot">{s.background === "design" ? "🎨 Code-drawn background" : `🖼️ ${s.visual ?? "AI image"}`}</div>
              </div>
            ))}
            <div className="storyslide more" style={{ display: "flex", flexDirection: "column", gap: 10, justifyContent: "center" }}>
              {imgs?.drawing ? (
                <span className="pulse">✏️ Drawing images…</span>
              ) : !imgs?.urls.some(Boolean) ? (
                <button className="btn small soft" disabled={busy} onClick={drawImages}>{busy ? <Spinner size={12} /> : "🎨"} Preview images</button>
              ) : null}
              <Link href={`/projects/${projectId}/content/${current.id}?tab=storyboard`}>Full storyboard →</Link>
            </div>
          </div>
        )}
        <div className="grid g2" style={{ gap: "0 24px" }}>
          {OPTION_FIELDS.map((f) => (
            <OptionPicker
              key={`${current.id}-${f}`}
              contentId={current.id}
              field={f}
              options={current.options[f] ?? []}
              selected={current.selection[f] ?? 0}
              preview={f === "script" || f === "hook"}
            />
          ))}
        </div>
        <div className="tagrow">{current.scenes.map((s, i) => <span key={i} className="tag">{i + 1}. {s.onScreenText || s.heading}</span>)}</div>
        <div className="divider" />
        <div className="row between" style={{ flexWrap: "wrap", gap: 10 }}>
          <div className="actions">
            <button className="btn ghost" disabled={busy} onClick={reject} title="Set this idea aside — it won't be drawn, rendered or published (you can restore it)"><X size={14} /> Reject</button>
            {nextPending && (
              <button className="btn ghost" disabled={busy} onClick={() => go(nextPending.id)}><SkipForward size={14} /> Skip</button>
            )}
            {pending.length > 1 && (
              <button className="btn soft" disabled={busy} onClick={approveAll}>{busy ? <Spinner /> : <Check size={14} />} Approve all ({pending.length})</button>
            )}
          </div>
          <button className="btn primary" disabled={busy} onClick={approveNext}>
            {busy ? <Spinner /> : <Check size={14} />} {pending.length > 1 ? "Approve & next" : "Approve"} {pending.length > 1 && <ArrowRight size={14} />}
          </button>
        </div>
        {error && <div className="err">{error}</div>}
      </div>
    </div>
  );
}
