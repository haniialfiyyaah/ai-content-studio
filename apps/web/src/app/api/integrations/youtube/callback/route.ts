import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { connectYoutube } from "@/lib/server/publishing";
import { appUrl, requireUser } from "@/lib/server/session";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(`${appUrl()}/settings?section=connections&${q}`);
  const jar = await cookies();
  const expected = jar.get("yt_oauth_state")?.value;
  jar.delete("yt_oauth_state");

  if (url.searchParams.get("error")) return back("error=youtube_denied");
  const code = url.searchParams.get("code");
  if (!code || !expected || url.searchParams.get("state") !== expected) return back("error=youtube_state");

  try {
    const { user } = await requireUser();
    await connectYoutube(user.id, code);
    return back("connected=youtube");
  } catch (e) {
    console.error("[youtube] connect failed", e);
    return back("error=youtube_failed");
  }
}
