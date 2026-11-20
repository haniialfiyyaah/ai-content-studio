import Link from "next/link";
import { Bell, Bot, Link2, Send, Sparkles, User } from "lucide-react";
import { youtubeConfigured } from "@acs/integrations";
import { ProfileForm, TelegramForm } from "@/components/settings/forms";
import { ActionButton } from "@/components/ui/action-button";
import { PageHead } from "@/components/ui/empty";
import { fmtDate } from "@/lib/format";
import { requireUser } from "@/lib/server/session";

const SECTIONS = [
  ["account", "Account", User],
  ["connections", "Connections", Link2],
  ["telegram", "Telegram", Send],
  ["notifications", "Notifications", Bell],
  ["ai", "AI Providers", Bot],
] as const;

const ERRORS: Record<string, string> = {
  youtube_not_configured: "YouTube isn't configured on the server yet (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).",
  youtube_denied: "Google access was denied.",
  youtube_state: "The connection expired — please try again.",
  youtube_failed: "Connecting YouTube failed. Please try again.",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ section?: string; error?: string; connected?: string }> }) {
  const { section = "account", error, connected } = await searchParams;
  const { supabase, user } = await requireUser();
  const [{ data: profile }, { data: yt }, { data: tg }, { count: sent }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("connected_accounts").select("*").eq("platform", "youtube").maybeSingle(),
    supabase.from("telegram_links").select("*").is("revoked_at", null).maybeSingle(),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("delivery_state", "delivered"),
  ]);

  return (
    <main className="page">
      <PageHead eyebrow="MANAGE" title="Settings" text="Account, publishing connections, Telegram and notifications." />
      {error && <div className="note amber" style={{ marginBottom: 16 }}>{ERRORS[error] ?? "Something went wrong."}</div>}
      {connected === "youtube" && <div className="note green" style={{ marginBottom: 16 }}>YouTube connected — scheduled videos will upload to your channel.</div>}
      <div className="manage-settings">
        <nav className="manage-sidebar">
          {SECTIONS.map(([k, l, Icon]) => (
            <Link key={k} href={`/settings?section=${k}`} className={`manage-nav ${section === k ? "active" : ""}`}><Icon size={15} /> {l}</Link>
          ))}
        </nav>
        <div className="card pad">
          {section === "account" && (
            <>
              <div className="section"><h2>Account</h2></div>
              <ProfileForm displayName={profile?.display_name ?? ""} timezone={profile?.timezone ?? "Asia/Jakarta"} email={user.email ?? ""} />
            </>
          )}
          {section === "connections" && (
            <div className="connection-block">
              <div className="section"><div><h2>Publishing connections</h2><p>Scheduled videos upload to these channels.</p></div></div>
              <div className="setting-line">
                <div>
                  <div className="small semibold">YouTube Shorts</div>
                  <div className="xs muted">{yt ? `${yt.display_name} · connected ${fmtDate(yt.connected_at)}${yt.status === "error" ? " · needs reconnect" : ""}` : "Upload and read video statistics on your channel."}</div>
                </div>
                {yt?.status === "connected" ? (
                  <ActionButton path="/api/integrations/youtube" method="DELETE" confirm="Disconnect YouTube? Scheduled uploads will fail until you reconnect." className="btn">Disconnect</ActionButton>
                ) : (
                  <a className="btn primary" href="/api/integrations/youtube/connect">{yt ? "Reconnect" : "Connect YouTube"}</a>
                )}
              </div>
              {!youtubeConfigured() && <div className="note amber" style={{ marginTop: 12 }}>Server setup needed: add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (YouTube Data API v3 enabled).</div>}
              <div className="setting-line"><div><div className="small semibold">Instagram Reels / TikTok</div><div className="xs muted">Not available yet.</div></div><span className="pill off">Soon</span></div>
            </div>
          )}
          {section === "telegram" && (
            <>
              <div className="section"><div><h2>Telegram</h2><p>Start projects from chat and get notified when videos are ready.</p></div></div>
              <TelegramForm linked={Boolean(tg)} telegramUserId={tg ? String(tg.telegram_user_id) : undefined} notificationsEnabled={tg?.notifications_enabled ?? true} />
            </>
          )}
          {section === "notifications" && (
            <>
              <div className="section"><h2>Notifications</h2></div>
              <div className="setting-line"><div><div className="small semibold">In-app</div><div className="xs muted">Dashboard, Videos and Projects update live — no refresh needed.</div></div><span className="pill approved">On</span></div>
              <div className="setting-line"><div><div className="small semibold">Telegram</div><div className="xs muted">{tg ? (tg.notifications_enabled ? "On" : "Muted") : "Link Telegram to enable"} · {sent ?? 0} delivered</div></div><Link className="btn small" href="/settings?section=telegram">Manage</Link></div>
            </>
          )}
          {section === "ai" && (
            <>
              <div className="section"><div><h2>AI Providers</h2><p>Studio manages all provider keys — nothing to configure.</p></div><span className="pill approved">Managed</span></div>
              <div className="ai-option selected">
                <Sparkles size={18} color="var(--accent)" />
                <div>
                  <div className="small semibold">Studio AI (managed)</div>
                  <div className="xs muted line">OpenAI plans projects, content options and scenes. fal.ai generates scene footage and composes the final Short; ElevenLabs voices narration when enabled. Usage is covered by Studio.</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
