import { NextResponse, type NextRequest } from "next/server";
import { createDb } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-redirect";

/** Completes email-link flows (password recovery): exchanges the one-time code for a session. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  if (code) {
    const db = await createDb();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.nextUrl.origin));
  }
  return NextResponse.redirect(new URL("/login?reason=link-invalid", request.nextUrl.origin));
}
