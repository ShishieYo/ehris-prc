import type { Metadata } from "next";
import { requireCtx } from "@/lib/auth/session";
import { getLookups } from "@/lib/data/lookups";
import { listEmployeeOptions } from "@/lib/data/employees";
import { NoAccess, PageHeader } from "@/components/ui/primitives";
import { EmployeeForm } from "@/components/employee/employee-form";

export const metadata: Metadata = { title: "New employee" };

export default async function NewEmployeePage() {
  const ctx = await requireCtx();
  if (!ctx.can("employee.write")) return <NoAccess />;
  const [lookups, supervisors] = await Promise.all([getLookups(ctx), listEmployeeOptions(ctx)]);
  return (
    <>
      <PageHeader title="New employee record" description="Create the master record. Documents, PDS and service record are added afterwards." />
      <EmployeeForm ctx={ctx} lookups={lookups} supervisors={supervisors} />
    </>
  );
}
