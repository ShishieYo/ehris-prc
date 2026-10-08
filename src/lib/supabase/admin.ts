import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "@/lib/db/database.types";

/**
 * Service-role client: BYPASSES Row Level Security. Import it only from the
 * few places that genuinely need it (user provisioning, the notification
 * worker) and always authorize the caller first.
 */
export function createAdminDb(): SupabaseClient<Database> {
  const key = env().SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return createClient<Database>(env().SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
