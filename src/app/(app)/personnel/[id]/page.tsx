import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/lib/auth/session";
import { getLookups } from "@/lib/data/lookups";
import { getAddresses, getChangeHistory, getCompletion, getEmployee, getEmployeePrivate, getDirectoryEntry } from "@/lib/data/employees";
import { logEvent } from "@/lib/audit";
import { Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/charts";
import { Table, TBody, Td, THead, Th } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { AddressSection, EmployeeHeaderCard, EmploymentSection, PersonalSection } from "@/components/employee/sections";
import { fmtDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Employee record" };

export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab = "overview" } = await searchParams;
  const ctx = await requireCtx();
  const employee = await getEmployee(ctx, id);
  const isSelf = ctx.employeeId === id;
  const sensitive = isSelf || ctx.can("employee.read_sensitive");
  const canHistory = ctx.canAny("employee.read_all", "audit.read");

  const [lookups, priv, addresses, supervisor, completion] = await Promise.all([
    getLookups(ctx),
    sensitive ? getEmployeePrivate(ctx, id) : Promise.resolve(null),
    sensitive ? getAddresses(ctx, id) : Promise.resolve([]),
    employee.supervisor_employee_id ? getDirectoryEntry(ctx, employee.supervisor_employee_id) : Promise.resolve(null),
    ctx.can("employee.read_all") ? getCompletion(ctx, id) : Promise.resolve(null),
  ]);
  if (!isSelf) {
    await logEvent(ctx, sensitive && priv ? "employee.sensitive_viewed" : "employee.viewed", "employee", { entityType: "employees", entityId: id, subjectEmployeeId: id });
  }
  const history = tab === "history" && canHistory ? await getChangeHistory(ctx, id) : [];

  return (
    <>
      <PageHeader
        title="Employee record"
        actions={
          <>
            {ctx.can("employee.write") && <LinkButton href={`/personnel/${id}/edit`}>Edit record</LinkButton>}
          </>
        }
      />
      <div className="space-y-6">
        <EmployeeHeaderCard employee={employee} lookups={lookups} />
        <nav aria-label="Related records" className="no-print flex flex-wrap gap-2 text-sm">
          {[
            [`/pds/${id}`, "PDS", ctx.can("pds.read_all") || isSelf],
            [`/service-record/${id}`, "Service record", ctx.can("service_record.read_all") || isSelf],
            [`/documents?employee=${id}`, "Documents", ctx.can("document.read_all") || isSelf],
            [`/attendance?employee=${id}`, "Attendance", true],
          ].filter(([, , show]) => show).map(([href, label]) => (
            <Link key={String(href)} href={String(href)} className="rounded-md border border-line bg-white px-3 py-1.5 font-medium text-brand-800 hover:bg-brand-50">{label}</Link>
          ))}
        </nav>
        <Tabs active={tab} items={[
          { key: "overview", label: "Overview", href: `/personnel/${id}` },
          { key: "history", label: "Change history", href: `/personnel/${id}?tab=history`, hidden: !canHistory },
        ]} />

        {tab === "history" && canHistory ? (
          <Card>
            <CardHeader title="Change history" description="Field-level changes with who, when and why. Sensitive values are masked." />
            {history.length === 0 ? <EmptyState title="No recorded changes yet" /> : (
              <Table caption="Employee change history">
                <THead><Th>Date</Th><Th>Field</Th><Th>Previous</Th><Th>New</Th><Th>Changed by</Th><Th>Reason</Th></THead>
                <TBody>
                  {history.map((h, i) => (
                    <tr key={i}>
                      <Td className="whitespace-nowrap">{fmtDateTime(h.occurred_at)}</Td>
                      <Td className="font-mono text-xs">{h.field}</Td>
                      <Td>{h.old_value ?? "—"}</Td><Td>{h.new_value ?? "—"}</Td>
                      <Td>{h.changed_by}</Td><Td>{h.reason ?? "—"}</Td>
                    </tr>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        ) : (
          <>
            {completion && (
              <Card>
                <CardBody className="flex flex-wrap items-center gap-4">
                  <div className="w-48"><p className="text-xs uppercase tracking-wide text-slate-500">Record completeness</p><p className="text-2xl font-semibold text-brand-900">{completion.percent}%</p></div>
                  <div className="min-w-48 flex-1"><ProgressBar percent={completion.percent} label="Record completeness" /></div>
                </CardBody>
              </Card>
            )}
            <EmploymentSection employee={employee} lookups={lookups} supervisor={supervisor?.full_name} />
            <PersonalSection employee={employee} priv={priv} showFullIds={sensitive} />
            {sensitive && <AddressSection addresses={addresses} />}
          </>
        )}
      </div>
    </>
  );
}
