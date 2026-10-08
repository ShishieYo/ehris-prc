import type { Metadata } from "next";
import { requireCtx } from "@/lib/auth/session";
import { AUDIT_PAGE, auditQuery, type AuditFilters } from "@/lib/data/audit";
import { Card, CardBody, EmptyState, NoAccess, PageHeader } from "@/components/ui/primitives";
import { Button, LinkButton } from "@/components/ui/button";
import { Table, TBody, Td, THead, Th } from "@/components/ui/table";
import { Pagination } from "@/components/ui/tabs";
import { SelectField, TextField } from "@/components/ui/form";
import { fmtDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Audit logs" };
const MODULES = ["access", "employee", "pds", "service_record", "document", "attendance", "leave", "hr_request", "organization", "configuration", "import", "report"];

export default async function AuditPage({ searchParams }: { searchParams: Promise<AuditFilters> }) {
  const ctx = await requireCtx();
  if (!ctx.can("audit.read")) return <NoAccess />;
  const f = await searchParams;
  const page = Math.max(1, Number(f.page) || 1);
  const { data, count, error } = await auditQuery(ctx, f).range((page - 1) * AUDIT_PAGE, page * AUDIT_PAGE - 1);
  if (error) throw error;
  const rows = data ?? [];
  const qs = new URLSearchParams(Object.entries(f).filter(([k, v]) => v && k !== "page") as [string, string][]).toString();

  return (
    <>
      <PageHeader title="Audit logs" description="Immutable record of sign-ins, record changes, views, downloads, approvals and administration. Sensitive identifiers are masked."
        actions={<LinkButton href={`/audit/export?${qs}`} variant="secondary">Export CSV</LinkButton>} />
      <Card className="mb-4">
        <CardBody>
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" aria-label="Filter audit log">
            <TextField label="From" name="from" type="date" defaultValue={f.from} />
            <TextField label="To" name="to" type="date" defaultValue={f.to} />
            <SelectField label="Module" name="module" placeholder="All" defaultValue={f.module ?? ""} options={MODULES.map((m) => ({ value: m, label: m }))} />
            <TextField label="User" name="actor" defaultValue={f.actor} />
            <TextField label="Action" name="action" placeholder="e.g. document" defaultValue={f.action} />
            <div className="flex items-end"><Button type="submit">Apply</Button></div>
          </form>
        </CardBody>
      </Card>
      <Card>
        {rows.length === 0 ? <EmptyState title="No matching audit records" /> : (
          <Table caption="Audit log entries">
            <THead><Th>When</Th><Th>User</Th><Th>Action</Th><Th>Module</Th><Th>Record</Th><Th>Change</Th></THead>
            <TBody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap">{fmtDateTime(r.occurred_at)}</Td>
                  <Td>{r.actor_label}</Td>
                  <Td className="font-mono text-xs">{r.action}</Td>
                  <Td>{r.module}</Td>
                  <Td className="max-w-40 truncate font-mono text-xs" title={r.entity_id ?? ""}>{r.entity_type}{r.entity_id ? ` · ${r.entity_id.slice(0, 8)}` : ""}</Td>
                  <Td>
                    {(r.old_values || r.new_values || r.reason || Object.keys((r.metadata as object) ?? {}).length > 0) ? (
                      <details><summary className="cursor-pointer text-brand-700">Details</summary>
                        <pre className="mt-1 max-w-md overflow-x-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs">{JSON.stringify({ reason: r.reason, before: r.old_values, after: r.new_values, metadata: r.metadata }, null, 2)}</pre>
                      </details>
                    ) : "—"}
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
        <Pagination basePath="/audit" params={{ from: f.from, to: f.to, module: f.module, actor: f.actor, action: f.action }} page={page} pageSize={AUDIT_PAGE} total={count ?? 0} />
      </Card>
    </>
  );
}
