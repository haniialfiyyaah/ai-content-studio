import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/response";
import { downloadUrl } from "@/lib/server/renders";
import { requireUser } from "@/lib/server/session";

/** Redirects to a short-lived signed URL with Content-Disposition: attachment. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { user } = await requireUser();
    const url = await downloadUrl(user.id, id);
    if (!url) throw new Error("Download unavailable");
    return NextResponse.redirect(url);
  } catch (e) {
    return jsonError(e);
  }
}
