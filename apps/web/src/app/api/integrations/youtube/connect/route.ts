import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { buildYoutubeAuthUrl, youtubeConfigured } from "@acs/integrations";
import { youtubeRedirectUri } from "@/lib/server/publishing";
import { appUrl, requireUser } from "@/lib/server/session";

/** Starts Google OAuth; CSRF state is bound to the browser via cookie. */
export async function GET() {
  try {
    await requireUser();
  } catch {
    return NextResponse.redirect(`${appUrl()}/login`);
  }
  if (!youtubeConfigured()) {
    return NextResponse.redirect(`${appUrl()}/settings?section=connections&error=youtube_not_configured`);
  }
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(buildYoutubeAuthUrl(youtubeRedirectUri(), state));
  res.cookies.set("yt_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
