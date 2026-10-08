import type { Metadata } from "next";
import { requireCtx } from "@/lib/auth/session";
import { getLookups } from "@/lib/data/lookups";
import { getEmployee, getEmployeePrivate, listEmployeeOptions } from "@/lib/data/employees";
import { NoAccess, PageHeader } from "@/components/ui/primitives";
import { EmployeeForm } from "@/components/employee/employee-form";
import { AddressForm } from "@/components/employee/contact-forms";
import { getAddresses } from "@/lib/data/employees";

export const metadata: Metadata = { title: "Edit employee" };

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  if (!ctx.can("employee.write")) return <NoAccess />;
  const [employee, lookups, supervisors] = await Promise.all([getEmployee(ctx, id), getLookups(ctx), listEmployeeOptions(ctx)]);
  const sensitive = ctx.can("employee.read_sensitive");
  const priv = sensitive ? await getEmployeePrivate(ctx, id) : null;
  const addresses = sensitive ? await getAddresses(ctx, id) : [];
  return (
    <>
      <PageHeader title={`Edit ${employee.first_name} ${employee.last_name}`} description="Every change is recorded in the change history with your name and the reason you give." />
      <EmployeeForm ctx={ctx} lookups={lookups} employee={employee} priv={priv} supervisors={supervisors} />
      {sensitive && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <AddressForm employeeId={id} type="residential" address={addresses.find((a) => a.address_type === "residential")} />
          <AddressForm employeeId={id} type="permanent" address={addresses.find((a) => a.address_type === "permanent")} />
        </div>
      )}
    </>
  );
}
