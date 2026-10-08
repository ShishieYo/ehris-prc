import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "@/lib/db/database.types";

export type Db = SupabaseClient<Database>;

/** Best-effort client address behind a trusted reverse proxy (first hop). */
function clientIp(h: Headers): string | undefined {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
}

/**
 * Supabase client acting as the signed-in user: every query runs under their
 * JWT, so Row Level Security decides what they can see and change.
 * The forwarded x-client-* headers let the database record device metadata in
 * the audit trail (only stored if the agency enables it).
 */
export async function createDb(): Promise<Db> {
  const cookieStore = await cookies();
  const h = await headers();
  const forwarded: Record<string, string> = {};
  const ip = clientIp(h);
  if (ip) forwarded["x-client-ip"] = ip;
  const ua = h.get("user-agent");
  if (ua) forwarded["x-client-ua"] = ua.slice(0, 300);

  return createServerClient<Database>(env().SUPABASE_URL, env().SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: the proxy refreshes the session cookie instead.
        }
      },
    },
    global: { headers: forwarded },
  });
}
