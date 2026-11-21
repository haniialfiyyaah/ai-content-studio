"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { api } from "@/lib/client/api";
import { Spinner } from "@/components/ui/spinner";

const CONFETTI = ["#8166e2", "#f2a65a", "#2c9a75", "#e8735a", "#5aa9e6", "#f5c84c"];

/**
 * "Yeay, your project is ready!" — appears live when the project setup locks.
 * Generate content starts by itself after a short countdown (the creator
 * already confirmed the setup). The project setup shows behind it.
 */
export function ReadyModal({ projectId, seconds, auto }: { projectId: string; seconds: number; auto: boolean }) {
  const router = useRouter();
  const key = `acs.ready.later.${projectId}`;
  const [open, setOpen] = useState(true);
  const [later, setLater] = useState(false);
  // "Not now" survives a reload: the inline bar stays instead of the pop-up.
  useEffect(() => {
    try { if (sessionStorage.getItem(key) === "1") { setLater(true); setOpen(false); } } catch {} // eslint-disable-line react-hooks/set-state-in-effect
  }, [key]);
  const [left, setLeft] = useState(seconds);
  const [busy, setBusy] = useState(false);
  const fired = useRef(false);
  const primary = useRef<HTMLButtonElement>(null);

  const generate = useCallback(async () => {
    if (fired.current) return;
    fired.current = true;
    setBusy(true);
    await api(`/api/projects/${projectId}/setup`, "POST", { action: "continue" }).catch(() => undefined);
    setOpen(false);
    router.refresh();
  }, [projectId, router]);

  const notNow = useCallback(async () => {
    try { sessionStorage.setItem(key, "1"); } catch {}
    setOpen(false);
    setLater(true);
    // Not now = stop the countdown and the auto setup; nothing starts until Generate content.
    await api(`/api/projects/${projectId}/settings`, "PATCH", { autoApprove: false }).catch(() => undefined);
    router.refresh();
  }, [key, projectId, router]);

  useEffect(() => {
    if (!open || busy) return;
    primary.current?.focus();
    if (left <= 0) {
      void generate();
      return;
    }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [open, busy, left, generate]);

  if (!open && later) {
    return (
      <div className="card ready-inline">
        <div className="ready-mark"><Sparkles size={18} /></div>
        <div style={{ minWidth: 0 }}>
          <div className="semibold">Your project is ready</div>
          <div className="xs muted">Generate the content when you&apos;re ready — or tell the agent what you want first.</div>
        </div>
        <button className="btn primary" disabled={busy} onClick={() => void generate()}>
          {busy ? <Spinner size={13} /> : <Sparkles size={14} />} Generate content
        </button>
      </div>
    );
  }
  if (!open) return null;
  const pct = ((seconds - left) / seconds) * 100;

  return (
    <div className="ready-overlay" role="dialog" aria-modal="true" aria-labelledby="ready-title">
      <div className="ready-pop">
        <div className="confetti" aria-hidden>
          {Array.from({ length: 14 }, (_, i) => (
            <i key={i} style={{ "--a": `${(360 / 14) * i}deg`, "--c": CONFETTI[i % CONFETTI.length], "--d": `${i * 18}ms` } as React.CSSProperties} />
          ))}
        </div>
        <div className="ready-mark big"><Sparkles size={24} /></div>
        <h2 id="ready-title" className="ready-title">Yeay, your project is ready! 🎉</h2>
        <p className="small muted line">
          The project setup is locked. Next I&apos;ll plan the content{auto ? " and write the storyboards" : ""} — one video or a series, with the concept of each.
        </p>
        <div className="ready-actions">
          <button ref={primary} className="btn primary ready-go" onClick={() => void generate()} disabled={busy} style={{ "--p": `${pct}%` } as React.CSSProperties}>
            {busy ? <Spinner size={13} /> : <Sparkles size={14} />}
            {busy ? "Starting…" : `Generate content · ${left}s`}
          </button>
          <button className="btn ghost" onClick={() => void notNow()} disabled={busy}>Not now</button>
        </div>
        <div className="tiny faint">Starts by itself when the timer ends. Not now stops it{auto ? " and turns auto off" : ""}.</div>
      </div>
    </div>
  );
}
