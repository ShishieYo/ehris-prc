import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { env } from "@/lib/env";
import { CHANNELS } from "./channels";
import type { ChannelId, NotificationChannel } from "./types";

const MAX_ATTEMPTS = 5;

export type ProcessStats = { sent: number; failed: number; skippedUnconfigured: number };

/**
 * Delivers pending outbox rows through the registered channels.
 * Uses the service-role client (it must read every user's outbox), so it is
 * only reachable from the secret-protected job route.
 */
export async function processOutbox(
  db: SupabaseClient<Database>,
  channels: Record<ChannelId, NotificationChannel> = CHANNELS,
  limit = 50,
): Promise<ProcessStats> {
  const stats: ProcessStats = { sent: 0, failed: 0, skippedUnconfigured: 0 };
  const { data: pending, error } = await db
    .from("notification_outbox")
    .select("id, channel, attempts, notification_id")
    .eq("status", "pending")
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at")
    .limit(limit);
  if (error) throw error;

  for (const row of pending ?? []) {
    const channel = channels[row.channel as ChannelId];
    if (!channel?.configured) {
      stats.skippedUnconfigured++;
      continue; // stays pending until a provider is configured
    }
    const { data: n } = await db.from("notifications").select("*").eq("id", row.notification_id).maybeSingle();
    const { data: profile } = n ? await db.from("profiles").select("email").eq("user_id", n.user_id).maybeSingle() : { data: null };
    try {
      if (!n) throw new Error("notification missing");
      await channel.send({
        notificationId: n.id,
        to: { email: profile?.email },
        title: n.title,
        body: n.body,
        link: n.link ? `${env().APP_URL}${n.link}` : null,
      });
      await db.from("notification_outbox").update({ status: "sent", sent_at: new Date().toISOString(), attempts: row.attempts + 1 }).eq("id", row.id);
      stats.sent++;
    } catch (e) {
      const attempts = row.attempts + 1;
      await db.from("notification_outbox").update({ attempts, status: attempts >= MAX_ATTEMPTS ? "failed" : "pending", last_error: String((e as Error).message).slice(0, 300) }).eq("id", row.id);
      stats.failed++;
    }
  }
  return stats;
}
