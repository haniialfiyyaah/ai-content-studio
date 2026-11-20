import "server-only";
import { AppError, ErrorCodes, notFound, resolveContent } from "@acs/domain";
import {
  decryptSecret,
  encryptSecret,
  exchangeYoutubeCode,
  getMyChannel,
  getVideoStats,
  refreshYoutubeToken,
  uploadYoutubeVideo,
  YOUTUBE_SCOPES,
} from "@acs/integrations";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity, notifyTelegram } from "./events";
import type { PublishJobRow } from "./rows";
import { appUrl } from "./session";

const admin = () => createAdminClient();
export const youtubeRedirectUri = () => `${appUrl()}/api/integrations/youtube/callback`;

// ---------------------------------------------------------------------------
// OAuth connection
// ---------------------------------------------------------------------------
export async function connectYoutube(ownerId: string, code: string) {
  const tokens = await exchangeYoutubeCode(code, youtubeRedirectUri());
  if (!tokens.refreshToken) {
    throw new AppError(ErrorCodes.PROVIDER_ERROR, "Google did not return a refresh token — remove the app from your Google account and connect again", 400);
  }
  const channel = await getMyChannel(tokens.accessToken);
  const db = admin();
  const { data: account, error } = await db
    .from("connected_accounts")
    .upsert(
      {
        owner_id: ownerId,
        platform: "youtube",
        external_account_id: channel?.id ?? null,
        display_name: channel?.title ?? "YouTube channel",
        status: "connected",
        scopes: tokens.scopes.length ? tokens.scopes : YOUTUBE_SCOPES,
        connected_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,platform" },
    )
    .select("id")
    .single();
  if (error || !account) throw new AppError(ErrorCodes.INTERNAL_ERROR, "Could not save connection", 500);
  await db.from("oauth_tokens").upsert({
    account_id: account.id,
    access_token_enc: encryptSecret(tokens.accessToken),
    refresh_token_enc: encryptSecret(tokens.refreshToken),
    expires_at: tokens.expiresAt.toISOString(),
  });
  await logActivity(db, { ownerId, kind: "youtube.connected", message: `YouTube connected: ${channel?.title ?? "channel"}` });
  return { channel: channel?.title ?? null };
}

export async function disconnectYoutube(ownerId: string) {
  await admin().from("connected_accounts").delete().eq("owner_id", ownerId).eq("platform", "youtube");
  return { ok: true };
}

async function youtubeAccessToken(ownerId: string): Promise<string> {
  const db = admin();
  const { data: account } = await db
    .from("connected_accounts")
    .select("id, status")
    .eq("owner_id", ownerId)
    .eq("platform", "youtube")
    .maybeSingle();
  if (!account || account.status !== "connected") {
    throw new AppError(ErrorCodes.NOT_READY, "YouTube is not connected", 409);
  }
  const { data: tok } = await db.from("oauth_tokens").select("*").eq("account_id", account.id).single();
  if (tok?.access_token_enc && tok.expires_at && new Date(tok.expires_at).getTime() > Date.now()) {
    return decryptSecret(tok.access_token_enc);
  }
  try {
    const fresh = await refreshYoutubeToken(decryptSecret(tok!.refresh_token_enc));
    await db
      .from("oauth_tokens")
      .update({ access_token_enc: encryptSecret(fresh.accessToken), expires_at: fresh.expiresAt.toISOString() })
      .eq("account_id", account.id);
    return fresh.accessToken;
  } catch (e) {
    await db.from("connected_accounts").update({ status: "error" }).eq("id", account.id);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// WF-03: run one due publish job (claim → upload → record)
// ---------------------------------------------------------------------------
export async function runPublishJob(jobId: string) {
  const db = admin();
  const { data: job } = await db.from("publish_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job) throw notFound("Publish job");
  const j = job as PublishJobRow;

  const { data: render } = await db
    .from("video_renders")
    .select("id, status, storage_path")
    .eq("content_id", j.content_id)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!render?.storage_path) {
    // Video not ready yet: leave it scheduled; the next sweep tries again.
    return { status: "waiting_for_video" };
  }

  const { data: claimed } = await db
    .from("publish_jobs")
    .update({ status: "publishing", attempts: j.attempts + 1, render_id: render.id })
    .eq("id", j.id)
    .eq("status", "scheduled")
    .select("id")
    .maybeSingle();
  if (!claimed) return { status: "already_claimed" };

  try {
    const { data: content } = await db.from("contents").select("options, selection").eq("id", j.content_id).single();
    const picked = resolveContent(content?.options, content?.selection);
    const { data: file, error } = await db.storage.from("renders").download(render.storage_path);
    if (error || !file) throw new AppError(ErrorCodes.INTERNAL_ERROR, "Rendered video missing from storage", 500);

    const token = await youtubeAccessToken(j.owner_id);
    const tags = picked.hashtags.split(/[\s,]+/).map((t) => t.replace(/^#/, "")).filter(Boolean);
    const uploaded = await uploadYoutubeVideo({
      accessToken: token,
      video: await file.arrayBuffer(),
      title: picked.title,
      description: [picked.caption, picked.hashtags].filter(Boolean).join("\n\n"),
      tags,
    });

    await db
      .from("publish_jobs")
      .update({
        status: "published",
        external_id: uploaded.id,
        external_url: uploaded.url,
        published_at: new Date().toISOString(),
        error: null,
      })
      .eq("id", j.id);
    await logActivity(db, { ownerId: j.owner_id, projectId: j.project_id, kind: "publish.done", message: `Published to YouTube: ${picked.title}` });
    await notifyTelegram(db, {
      ownerId: j.owner_id,
      projectId: j.project_id,
      template: "publish.done",
      text: `✅ Published "${picked.title}" to YouTube.\n${uploaded.url}`,
    });
    return { status: "published", url: uploaded.url };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    const retry = j.attempts + 1 < 3;
    await db
      .from("publish_jobs")
      .update({ status: retry ? "scheduled" : "failed", error: message.slice(0, 500) })
      .eq("id", j.id);
    if (!retry) {
      await logActivity(db, { ownerId: j.owner_id, projectId: j.project_id, kind: "publish.failed", message: `YouTube upload failed: ${message}` });
      await notifyTelegram(db, {
        ownerId: j.owner_id,
        projectId: j.project_id,
        template: "publish.failed",
        text: `⚠️ YouTube upload failed: ${message}`,
        path: "/publishing",
      });
    }
    return { status: retry ? "retry_scheduled" : "failed", error: message };
  }
}

// ---------------------------------------------------------------------------
// WF-07: analytics snapshot for one published job
// ---------------------------------------------------------------------------
export async function captureAnalytics(jobId: string) {
  const db = admin();
  const { data: job } = await db.from("publish_jobs").select("id, owner_id, external_id").eq("id", jobId).single();
  if (!job?.external_id) return { skipped: true };
  const token = await youtubeAccessToken(job.owner_id);
  const [stats] = await getVideoStats(token, [job.external_id]);
  if (!stats) return { skipped: true };
  await db.from("analytics_snapshots").insert({
    owner_id: job.owner_id,
    publish_job_id: job.id,
    views: stats.views,
    likes: stats.likes,
    comments: stats.comments,
  });
  return stats;
}

export { appUrl };
