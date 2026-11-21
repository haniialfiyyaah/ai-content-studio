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
 * already confirmed the setup); Wait stops it.
 */
export function ReadyModal({ projectId, seconds, auto }: { projectId: string; seconds: number; auto: boolean }) {
  const router = useRouter();
  const key = `acs.ready.${projectId}`;
  const [open, setOpen] = useState(false);
  const [left, setLeft] = useState(seconds);
  const [busy, setBusy] = useState(false);
  const fired = useRef(false);
  const primary = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem(key) === "1"; } catch {}
    if (!seen) setOpen(true); // eslint-disable-line react-hooks/set-state-in-effect
  }, [key]);

  const close = useCallback(() => {
    try { sessionStorage.setItem(key, "1"); } catch {}
    setOpen(false);
  }, [key]);

  const generate = useCallback(async () => {
    if (fired.current) return;
    fired.current = true;
    setBusy(true);
    try { sessionStorage.setItem(key, "1"); } catch {}
    await api(`/api/projects/${projectId}/setup`, "POST", { action: "continue" }).catch(() => undefined);
    setOpen(false);
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

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open, close]);

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
          <button className="btn ghost" onClick={close} disabled={busy}>Wait</button>
        </div>
        <div className="tiny faint">Starts by itself when the timer ends. Wait stops it.</div>
      </div>
    </div>
  );
}
