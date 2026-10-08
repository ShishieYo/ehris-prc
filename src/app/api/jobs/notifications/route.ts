import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { createAdminDb } from "@/lib/supabase/admin";
import { processOutbox } from "@/lib/services/notifications/processor";

function authorized(request: NextRequest): boolean {
  const secret = env().CRON_SECRET;
  if (!secret) return false; // jobs are disabled unless a secret is configured
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Scheduler → app. Delivers pending email/SMS notifications through the registered channels. */
export async function POST(request: NextRequest) {
  if (!authorized(request)) return new NextResponse("Unauthorized", { status: 401 });
  const stats = await processOutbox(createAdminDb());
  return NextResponse.json(stats, { headers: { "Cache-Control": "no-store" } });
}
