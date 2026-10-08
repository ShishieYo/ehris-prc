import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { requireCtx } from "@/lib/auth/session";
import { buildNav } from "@/lib/nav";
import { env, isDemoMode } from "@/lib/env";
import { AppShell } from "./shell";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireCtx();
  if (!ctx.privacyOk) redirect("/privacy/accept");

  const [unread, pending] = await Promise.all([
    ctx.db.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    ctx.canAny("team.view", "leave.manage", "attendance.write", "request.process", "request.approve", "workflow.override")
      ? ctx.db.rpc("my_pending_actions")
      : Promise.resolve({ data: [] as unknown[] }),
  ]);
  const nav = buildNav(ctx, { unread: unread.count ?? 0, approvals: pending.data?.length ?? 0 });

  return (
    <AppShell
      primary={nav.primary}
      manage={nav.manage}
      user={{ name: ctx.displayName, roles: ctx.roles.map((r) => r.replace(/_/g, " ").toLowerCase()).join(" · ") }}
      idleMinutes={env().SESSION_IDLE_MINUTES}
      demo={isDemoMode()}
    >
      {children}
    </AppShell>
  );
}
