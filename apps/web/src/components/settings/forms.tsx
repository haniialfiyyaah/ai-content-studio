"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "@/lib/client/api";
import { Spinner } from "@/components/ui/spinner";

function useSave() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<unknown>, okText: string) =>
    start(async () => {
      setMsg(null);
      try {
        await fn();
        setMsg({ ok: true, text: okText });
        router.refresh();
      } catch (e) {
        setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save" });
      }
    });
  const note = msg && <span className={msg.ok ? "xs" : "err"} style={msg.ok ? { color: "var(--green)" } : undefined}>{msg.text}</span>;
  return { pending, run, note };
}

export function ProfileForm({ displayName, timezone, email }: { displayName: string; timezone: string; email: string }) {
  const [name, setName] = useState(displayName);
  const [tz, setTz] = useState(timezone);
  const { pending, run, note } = useSave();
  return (
    <div className="stack">
      <div className="formgrid">
        <div className="field"><label>Display name</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label>Email</label><input value={email} disabled /></div>
        <div className="field">
          <label>Timezone</label>
          <select value={tz} onChange={(e) => setTz(e.target.value)}>
            {["Asia/Jakarta", "Asia/Singapore", "Asia/Tokyo", "Europe/London", "America/New_York", "America/Los_Angeles", "UTC"].map((z) => <option key={z}>{z}</option>)}
          </select>
        </div>
      </div>
      <div className="row">
        <button className="btn primary" disabled={pending} onClick={() => run(() => api("/api/profile", "PATCH", { displayName: name, timezone: tz }), "Saved")}>{pending ? <><Spinner /> Saving…</> : "Save"}</button>
        {note}
      </div>
    </div>
  );
}

export function TelegramForm({ linked, telegramUserId, notificationsEnabled }: { linked: boolean; telegramUserId?: string; notificationsEnabled: boolean }) {
  const [id, setId] = useState(telegramUserId ?? "");
  const { pending, run, note } = useSave();
  if (linked) {
    return (
      <div className="stack">
        <div className="setting-line">
          <div><div className="small semibold">Linked Telegram user</div><div className="xs muted">ID {telegramUserId}</div></div>
          <span className="pill approved">Linked</span>
        </div>
        <div className="setting-line">
          <div><div className="small semibold">Notifications</div><div className="xs muted">Project ready, video ready, published, failures.</div></div>
          <button className={`toggle ${notificationsEnabled ? "on" : ""}`} disabled={pending} aria-label="Toggle Telegram notifications"
            onClick={() => run(() => api("/api/integrations/telegram", "PATCH", { notificationsEnabled: !notificationsEnabled }), "Updated")} />
        </div>
        <div className="row">
          <button className="btn" disabled={pending} onClick={() => run(() => api("/api/integrations/telegram", "DELETE"), "Unlinked")}>{pending ? <Spinner /> : null} Unlink Telegram</button>
          {note}
        </div>
      </div>
    );
  }
  return (
    <div className="stack">
      <div className="note">Message the Studio bot on Telegram — it replies with your numeric user ID. Paste it here, then send the bot an idea to start a project from your phone.</div>
      <div className="field"><label>Telegram user ID</label><input inputMode="numeric" value={id} onChange={(e) => setId(e.target.value.trim())} placeholder="e.g. 9172850538" /></div>
      <div className="row">
        <button className="btn primary" disabled={pending || !id} onClick={() => run(() => api("/api/integrations/telegram", "POST", { telegramUserId: id }), "Linked")}>{pending ? <><Spinner /> Linking…</> : "Link Telegram"}</button>
        {note}
      </div>
    </div>
  );
}
