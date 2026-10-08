import type { Metadata } from "next";
import { requireCtx } from "@/lib/auth/session";
import { getLookups } from "@/lib/data/lookups";
import { Card, CardBody, NoAccess, PageHeader } from "@/components/ui/primitives";
import { BalanceCards } from "@/components/leave/balance-cards";
import { LeaveForm } from "@/components/leave/leave-form";
import { todayManila } from "@/lib/format";

export const metadata: Metadata = { title: "File leave" };

export default async function NewLeavePage() {
  const ctx = await requireCtx();
  if (!ctx.employeeId) return <NoAccess />;
  const [lookups, { data }] = await Promise.all([
    getLookups(ctx),
    ctx.db.from("leave_balance_summary").select("*").eq("employee_id", ctx.employeeId).eq("year", Number(todayManila().slice(0, 4))),
  ]);
  return (
    <>
      <PageHeader title="File leave" description="Your immediate supervisor approves first; HR then processes the application." />
      <div className="space-y-6">
        <BalanceCards balances={data ?? []} />
        <Card><CardBody><LeaveForm lookups={lookups} /></CardBody></Card>
      </div>
    </>
  );
}
