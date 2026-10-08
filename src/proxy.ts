import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Runs before every page/action request:
 *  1. sets a per-request Content-Security-Policy nonce,
 *  2. refreshes the Supabase session cookie,
 *  3. sends signed-out visitors to /login,
 *  4. enforces an idle timeout and an absolute session lifetime.
 * This is an optimistic gate only; every page and action re-checks the user
 * and the database enforces permissions regardless.
 */

const PUBLIC_PATHS = new Set(["/login", "/forgot-password", "/privacy", "/auth/callback"]);
const LAST_ACTIVE = "ehris_last_active";
const SESSION_START = "ehris_session_start";

const idleMs = () => Number(process.env.SESSION_IDLE_MINUTES ?? 30) * 60_000;
const maxMs = () => Number(process.env.SESSION_MAX_HOURS ?? 12) * 3_600_000;

function csp(nonce: string) {
  const dev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes (progress bars) cannot carry a nonce; scripts are the XSS-critical surface.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = csp(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request: { headers: requestHeaders } });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims;
  const { pathname } = request.nextUrl;
  // Job endpoints authenticate with their own bearer secret, not a user session.
  const isPublic = PUBLIC_PATHS.has(pathname) || pathname.startsWith("/api/jobs/");
  const secure = process.env.NODE_ENV === "production";

  const redirectTo = (path: string, search?: Record<string, string>) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    for (const [k, v] of Object.entries(search ?? {})) url.searchParams.set(k, v);
    const redirect = NextResponse.redirect(url);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    redirect.headers.set("Content-Security-Policy", policy);
    return redirect;
  };

  if (signedIn) {
    const now = Date.now();
    const last = Number(request.cookies.get(LAST_ACTIVE)?.value ?? now);
    const start = Number(request.cookies.get(SESSION_START)?.value ?? now);
    if (now - last > idleMs() || now - start > maxMs()) {
      await supabase.auth.signOut();
      const out = redirectTo("/login", { reason: now - last > idleMs() ? "timeout" : "expired" });
      out.cookies.delete(LAST_ACTIVE);
      out.cookies.delete(SESSION_START);
      return out;
    }
    const prefetch = request.headers.get("next-router-prefetch") || request.headers.get("purpose") === "prefetch";
    const opts = { httpOnly: true, sameSite: "lax" as const, secure, path: "/" };
    if (!prefetch) response.cookies.set(LAST_ACTIVE, String(now), opts);
    if (!request.cookies.get(SESSION_START)) response.cookies.set(SESSION_START, String(now), opts);
    if (pathname === "/login") return redirectTo("/dashboard");
  } else if (!isPublic) {
    return redirectTo("/login", pathname === "/" ? {} : { next: pathname + request.nextUrl.search });
  }

  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
