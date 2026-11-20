import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/recover",
  "/api/auth/login",
  "/api/auth/signup",
];

export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const pathname = request.nextUrl.pathname;

  // Missing env used to throw inside createServerClient and surface as
  // MIDDLEWARE_INVOCATION_FAILED (500) on Vercel with no useful page.
  if (!supabaseUrl || !supabaseAnonKey) {
    if (
      PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
      pathname.startsWith("/api/")
    ) {
      return NextResponse.next({ request });
    }
    return new NextResponse(
      "Studio is missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Add them in Vercel → Settings → Environment Variables, then Redeploy.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  // Prefer getUser() over getSession() for authorization decisions.
  let user = null;
  try {
    // Local JWT verification (asymmetric signing keys) — no Auth round trip per request.
    const { data } = await supabase.auth.getClaims();
    user = data?.claims?.sub ? { id: data.claims.sub } : null;
  } catch (error) {
    console.error("supabase.auth.getUser failed in middleware", error);
    if (
      PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
      pathname.startsWith("/api/internal/")
    ) {
      return supabaseResponse;
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const isPublic =
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    pathname.startsWith("/api/internal/");

  if (!user && !isPublic && !pathname.startsWith("/_next")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
