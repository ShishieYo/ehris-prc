import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/lib/auth/session";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { InlineAction, SubmitButton } from "@/components/ui/action-form";
import { markAllRead, markRead } from "./actions";
import { fmtDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const ctx = await requireCtx();
  const { data, error } = await ctx.db.from("notifications").select("*").order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  const rows = data ?? [];
  return (
    <>
      <PageHeader title="Notifications" actions={rows.some((n) => !n.read_at) && <InlineAction action={markAllRead}><SubmitButton variant="secondary">Mark all as read</SubmitButton></InlineAction>} />
      <Card>
        {rows.length === 0 ? <EmptyState title="No notifications yet" /> : (
          <ul className="divide-y divide-line">
            {rows.map((n) => (
              <li key={n.id} className={`flex flex-wrap items-start justify-between gap-3 px-4 py-3 ${n.read_at ? "" : "bg-brand-50/50"}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{!n.read_at && <Badge tone="info">New</Badge>} {n.link ? <Link className="underline" href={n.link}>{n.title}</Link> : n.title}</p>
                  {n.body && <p className="text-sm text-slate-600">{n.body}</p>}
                  <p className="text-xs text-slate-400">{fmtDateTime(n.created_at)}</p>
                </div>
                {!n.read_at && <InlineAction action={markRead} hidden={{ id: n.id }}><SubmitButton variant="ghost" size="sm">Mark read</SubmitButton></InlineAction>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
