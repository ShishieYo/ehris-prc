import type { Metadata } from "next";
import { requireCtx } from "@/lib/auth/session";
import { NoAccess } from "@/components/ui/primitives";
import { Tabs } from "@/components/ui/tabs";
import { EmployeeView } from "./employee-view";
import { HrView } from "./hr-view";
import { ExecView } from "./exec-view";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const ctx = await requireCtx();
  const { view } = await searchParams;

  const hasSelf = !!ctx.employeeId;
  const hasHr = ctx.can("dashboard.hr");
  const hasExec = ctx.can("dashboard.executive");
  const available = [hasSelf && "me", hasHr && "hr", hasExec && "management"].filter(Boolean) as string[];
  if (available.length === 0) return <NoAccess />;
  const active = view && available.includes(view) ? view : available[0];

  return (
    <>
      <Tabs
        active={active}
        items={[
          { key: "me", label: "My dashboard", href: "/dashboard?view=me", hidden: !hasSelf },
          { key: "hr", label: "HR overview", href: "/dashboard?view=hr", hidden: !hasHr },
          { key: "management", label: "Management", href: "/dashboard?view=management", hidden: !hasExec },
        ]}
      />
      {active === "me" && <EmployeeView ctx={ctx} employeeId={ctx.employeeId!} />}
      {active === "hr" && <HrView ctx={ctx} />}
      {active === "management" && <ExecView ctx={ctx} />}
    </>
  );
}
