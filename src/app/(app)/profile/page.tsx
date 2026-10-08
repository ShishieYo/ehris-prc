import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/lib/auth/session";
import { getLookups } from "@/lib/data/lookups";
import { getAddresses, getCompletion, getDirectoryEntry, getEmployee, getEmployeePrivate } from "@/lib/data/employees";
import { Card, CardBody, CardHeader, NoAccess, PageHeader } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/charts";
import { AddressSection, EmployeeHeaderCard, EmploymentSection, PersonalSection } from "@/components/employee/sections";
import { AddressForm, ContactForm } from "@/components/employee/contact-forms";

export const metadata: Metadata = { title: "My Profile" };

export default async function ProfilePage() {
  const ctx = await requireCtx();
  if (!ctx.employeeId) return <NoAccess />;
  const id = ctx.employeeId;
  const [employee, lookups, priv, addresses, completion] = await Promise.all([
    getEmployee(ctx, id), getLookups(ctx), getEmployeePrivate(ctx, id), getAddresses(ctx, id), getCompletion(ctx, id),
  ]);
  const supervisor = employee.supervisor_employee_id ? await getDirectoryEntry(ctx, employee.supervisor_employee_id) : null;

  return (
    <>
      <PageHeader
        title="My Profile"
        description="Keep your contact details and PDS current. Changes to your name, civil status or employment details are processed by HR."
        actions={<><LinkButton href="/pds" variant="secondary">View PDS</LinkButton><LinkButton href="/requests/new?type=PERSONAL_INFO_UPDATE" variant="secondary">Request information update</LinkButton></>}
      />
      <div className="space-y-6">
        <EmployeeHeaderCard employee={employee} lookups={lookups} />
        <Card>
          <CardHeader title="Profile completion" description={`${completion.percent}% complete`} />
          <CardBody>
            <ProgressBar percent={completion.percent} label="Profile completion" />
            <ul className="mt-4 grid gap-1 sm:grid-cols-2">
              {completion.items.map((i) => (
                <li key={i.label} className="flex items-center gap-2 text-sm">
                  <span aria-hidden="true" className={i.done ? "text-emerald-600" : "text-slate-400"}>{i.done ? "✔" : "○"}</span>
                  <span className={i.done ? "text-slate-600" : "font-medium text-slate-900"}>{i.label}</span>
                  <span className="sr-only">{i.done ? "(done)" : "(to do)"}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate-500">Family, education and references are completed in your <Link className="underline" href="/pds">PDS</Link>; documents in <Link className="underline" href="/documents">Documents</Link>.</p>
          </CardBody>
        </Card>
        <EmploymentSection employee={employee} lookups={lookups} supervisor={supervisor?.full_name} />
        <PersonalSection employee={employee} priv={priv} showFullIds />
        <AddressSection addresses={addresses} />
        <div className="grid gap-6 lg:grid-cols-2">
          <ContactForm priv={priv} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <AddressForm employeeId={id} type="residential" address={addresses.find((a) => a.address_type === "residential")} />
          <AddressForm employeeId={id} type="permanent" address={addresses.find((a) => a.address_type === "permanent")} />
        </div>
      </div>
    </>
  );
}
