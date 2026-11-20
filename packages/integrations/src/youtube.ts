import { AppError, ErrorCodes } from "@acs/domain";

/**
 * YouTube Data API v3 via Google OAuth (offline access → refresh token).
 * Requires GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET; redirect URI must be
 * registered as `${APP_URL}/api/integrations/youtube/callback`.
 */
export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

function clientCreds() {
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!id || !secret) {
    throw new AppError(ErrorCodes.NOT_CONFIGURED, "Google OAuth is not configured (GOOGLE_CLIENT_ID/SECRET)", 503);
  }
  return { id, secret };
}

export function youtubeConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

export function buildYoutubeAuthUrl(redirectUri: string, state: string): string {
  const { id } = clientCreds();
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: YOUTUBE_SCOPES.join(" "),
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  scopes: string[];
}

async function tokenRequest(body: Record<string, string>): Promise<TokenSet> {
  const { id, secret } = clientCreds();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, ...body }),
  });
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new AppError(ErrorCodes.PROVIDER_ERROR, `Google token exchange failed: ${json.error ?? res.status}`, 502);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + (json.expires_in ?? 3600) * 1000 - 60_000),
    scopes: (json.scope ?? "").split(" ").filter(Boolean),
  };
}

export const exchangeYoutubeCode = (code: string, redirectUri: string) =>
  tokenRequest({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });

export const refreshYoutubeToken = (refreshToken: string) =>
  tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });

export async function getMyChannel(accessToken: string): Promise<{ id: string; title: string } | null> {
  const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { items?: { id: string; snippet?: { title?: string } }[] };
  const ch = json.items?.[0];
  return ch ? { id: ch.id, title: ch.snippet?.title ?? "YouTube channel" } : null;
}

/** Resumable upload of an MP4 as a public Short. Returns the video id. */
export async function uploadYoutubeVideo(input: {
  accessToken: string;
  video: ArrayBuffer;
  title: string;
  description: string;
  tags: string[];
  privacyStatus?: "public" | "unlisted" | "private";
}): Promise<{ id: string; url: string }> {
  const meta = {
    snippet: {
      title: input.title.slice(0, 100),
      description: input.description.slice(0, 4900),
      tags: input.tags.slice(0, 15),
      categoryId: "22",
    },
    status: {
      privacyStatus: input.privacyStatus ?? "public",
      selfDeclaredMadeForKids: false,
    },
  };

  const init = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "video/mp4",
        "X-Upload-Content-Length": String(input.video.byteLength),
      },
      body: JSON.stringify(meta),
    },
  );
  const location = init.headers.get("location");
  if (!init.ok || !location) {
    throw new AppError(ErrorCodes.PROVIDER_ERROR, `YouTube upload init failed (${init.status})`, 502, {
      body: (await init.text()).slice(0, 300),
    });
  }

  const put = await fetch(location, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4", "Content-Length": String(input.video.byteLength) },
    body: input.video,
  });
  const json = (await put.json().catch(() => ({}))) as { id?: string };
  if (!put.ok || !json.id) {
    throw new AppError(ErrorCodes.PROVIDER_ERROR, `YouTube upload failed (${put.status})`, 502);
  }
  return { id: json.id, url: `https://youtube.com/shorts/${json.id}` };
}

export async function getVideoStats(accessToken: string, videoIds: string[]) {
  if (!videoIds.length) return [];
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoIds.map(encodeURIComponent).join(",")}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new AppError(ErrorCodes.PROVIDER_ERROR, `YouTube stats failed (${res.status})`, 502);
  const json = (await res.json()) as {
    items?: { id: string; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }[];
  };
  return (json.items ?? []).map((v) => ({
    id: v.id,
    views: Number(v.statistics?.viewCount ?? 0),
    likes: Number(v.statistics?.likeCount ?? 0),
    comments: Number(v.statistics?.commentCount ?? 0),
  }));
}
