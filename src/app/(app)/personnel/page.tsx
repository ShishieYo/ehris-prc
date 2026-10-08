import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/lib/auth/session";
import { getLookups } from "@/lib/data/lookups";
import { PAGE_SIZE, searchEmployees, type SearchParams } from "@/lib/data/employees";
import { Card, EmptyState, NoAccess, PageHeader, Badge } from "@/components/ui/primitives";
import { LinkButton, Button } from "@/components/ui/button";
import { Table, TBody, Td, THead, Th } from "@/components/ui/table";
import { Pagination } from "@/components/ui/tabs";
import { SelectField, TextField } from "@/components/ui/form";

export const metadata: Metadata = { title: "Personnel Records" };

export default async function PersonnelPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireCtx();
  if (!ctx.canAny("employee.read_all", "team.view")) return <NoAccess />;
  const params = await searchParams;
  const [lookups, { rows, total, page }] = await Promise.all([getLookups(ctx), searchEmployees(ctx, params)]);
  const broad = ctx.can("employee.read_all");

  return (
    <>
      <PageHeader
        title="Personnel Records"
        description={broad ? "Search the workforce by ID, name, office, division, position or employment status." : "Employees in your office or unit."}
        actions={ctx.can("employee.write") && <LinkButton href="/personnel/new">New employee</LinkButton>}
      />
      <Card className="mb-4">
        <form className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5" role="search" aria-label="Search personnel">
          <div className="lg:col-span-2"><TextField label="Search" name="q" defaultValue={params.q ?? ""} placeholder="Name, employee ID, position, office…" /></div>
          <SelectField label="Division" name="division" placeholder="All divisions" defaultValue={params.division ?? ""} options={lookups.divisions.map((d) => ({ value: d.id, label: d.name }))} />
          <SelectField label="Employment status" name="status" placeholder="All statuses" defaultValue={params.status ?? ""} options={lookups.employmentStatuses.map((s) => ({ value: s.code, label: s.name }))} />
          <SelectField label="Record" name="record" defaultValue={params.record ?? "active"} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "separated", label: "Separated" }, { value: "all", label: "All" }]} />
          <div className="sm:col-span-2 lg:col-span-5"><Button type="submit">Search</Button></div>
        </form>
      </Card>
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No matching records">Try a different name or clear the filters.</EmptyState>
        ) : (
          <Table caption="Personnel search results">
            <THead><Th>Employee</Th><Th>Position</Th><Th>Division / unit</Th><Th>Status</Th></THead>
            <TBody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <Link href={`/personnel/${r.id}`} className="font-medium text-brand-700 underline">{r.full_name}</Link>
                    <div className="text-xs text-slate-500">{r.employee_no}</div>
                  </Td>
                  <Td>{r.position_title ?? "—"}</Td>
                  <Td>{r.division_name ?? "—"}<div className="text-xs text-slate-500">{r.unit_name}</div></Td>
                  <Td>
                    <Badge tone="info">{r.employment_status_name ?? "—"}</Badge>
                    {r.record_status !== "active" && <> <Badge tone="neutral">{r.record_status}</Badge></>}
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
        <Pagination basePath="/personnel" params={{ q: params.q, division: params.division, status: params.status, record: params.record }} page={page} pageSize={PAGE_SIZE} total={total} />
      </Card>
    </>
  );
}
