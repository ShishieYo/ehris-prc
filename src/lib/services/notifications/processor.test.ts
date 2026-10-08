import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { processOutbox } from "./processor";
import type { NotificationChannel } from "./types";

vi.mock("@/lib/env", () => ({ env: () => ({ APP_URL: "https://ehris.example" }) }));

function fakeDb(rows: unknown[]) {
  const updates: unknown[] = [];
  const chain = (data: unknown) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "lt", "order", "limit"]) q[m] = () => q;
    q.maybeSingle = async () => ({ data, error: null });
    q.then = (res: (v: unknown) => void) => res({ data, error: null });
    return q;
  };
  const db = {
    from: (table: string) => ({
      select: () => chain(table === "notification_outbox" ? rows : table === "notifications" ? { id: "n1", user_id: "u1", title: "T", body: "B", link: "/leave/1" } : { email: "a@b.example" }),
      update: (v: unknown) => ({ eq: async () => (updates.push(v), { error: null }) }),
    }),
  } as unknown as SupabaseClient;
  return { db, updates };
}

describe("processOutbox", () => {
  it("leaves rows pending when the channel is not configured (never pretends to send)", async () => {
    const { db, updates } = fakeDb([{ id: "o1", channel: "email", attempts: 0, notification_id: "n1" }]);
    const channels = { email: { id: "email", configured: false, send: vi.fn() }, sms: { id: "sms", configured: false, send: vi.fn() } } as unknown as Record<"email" | "sms", NotificationChannel>;
    const stats = await processOutbox(db as never, channels);
    expect(stats).toEqual({ sent: 0, failed: 0, skippedUnconfigured: 1 });
    expect(updates).toHaveLength(0);
  });

  it("marks rows sent when a configured channel succeeds, and counts failures otherwise", async () => {
    const send = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("smtp down"));
    const channels = { email: { id: "email", configured: true, send }, sms: { id: "sms", configured: false, send: vi.fn() } } as unknown as Record<"email" | "sms", NotificationChannel>;
    const { db, updates } = fakeDb([{ id: "o1", channel: "email", attempts: 0, notification_id: "n1" }, { id: "o2", channel: "email", attempts: 0, notification_id: "n1" }]);
    const stats = await processOutbox(db as never, channels);
    expect(stats).toEqual({ sent: 1, failed: 1, skippedUnconfigured: 0 });
    expect(send.mock.calls[0][0]).toMatchObject({ to: { email: "a@b.example" }, link: "https://ehris.example/leave/1" });
    expect(updates[0]).toMatchObject({ status: "sent" });
    expect(updates[1]).toMatchObject({ status: "pending", attempts: 1, last_error: "smtp down" });
  });
});
