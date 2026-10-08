import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/lib/auth/session";
import { getLookups } from "@/lib/data/lookups";
import { Card, EmptyState, NoAccess, PageHeader, Badge } from "@/components/ui/primitives";
import { LinkButton, Button } from "@/components/ui/button";
import { RequestStatusBadge } from "@/components/ui/status";
import { Table, TBody, Td, THead, Th } from "@/components/ui/table";
import { Tabs, Pagination } from "@/components/ui/tabs";
import { SelectField } from "@/components/ui/form";
import { fmtDate } from "@/lib/format";

export const metadata: Metadata = { title: "HR Requests" };
const PAGE = 25;

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ scope?: string; status?: string; type?: string; page?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const all = sp.scope === "all" && ctx.can("request.read_all");
  if (!ctx.employeeId && !all && !ctx.can("request.read_all")) return <NoAccess />;
  const page = Math.max(1, Number(sp.page) || 1);

  const lookups = await getLookups(ctx);
  let q = ctx.db.from("hr_requests").select("*", { count: "exact" }).order("created_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (!all && ctx.employeeId) q = q.eq("employee_id", ctx.employeeId);
  if (sp.status) q = q.eq("status", sp.status);
  if (sp.type) q = q.eq("request_type_code", sp.type);
  const { data, count, error } = await q;
  if (error) throw error;
  const rows = data ?? [];
  const names = new Map<string, string>();
  if (all && rows.length) {
    const { data: people } = await ctx.db.from("employee_directory").select("id, full_name").in("id", [...new Set(rows.map((r) => r.employee_id))]);
    for (const p of people ?? []) if (p.id && p.full_name) names.set(p.id, p.full_name);
  }
  const typeName = (c: string) => lookups.requestTypes.find((t) => t.code === c)?.name ?? c;

  return (
    <>
      <PageHeader title="HR Requests" description="Request certificates, documents and other HR services, and track every step." actions={ctx.employeeId && <LinkButton href="/requests/new">New request</LinkButton>} />
      {ctx.can("request.read_all") && (
        <Tabs active={all ? "all" : "mine"} items={[{ key: "mine", label: "My requests", href: "/requests", hidden: !ctx.employeeId }, { key: "all", label: "All requests (HR)", href: "/requests?scope=all" }]} />
      )}
      <Card className="mb-4">
        <form className="flex flex-wrap items-end gap-3 p-4" aria-label="Filter requests">
          {all && <input type="hidden" name="scope" value="all" />}
          <SelectField label="Status" name="status" placeholder="Any" defaultValue={sp.status ?? ""} options={["draft", "in_review", "approved", "completed", "rejected", "cancelled"].map((s) => ({ value: s, label: s.replace("_", " ") }))} />
          <SelectField label="Type" name="type" placeholder="Any" defaultValue={sp.type ?? ""} options={lookups.requestTypes.map((t) => ({ value: t.code, label: t.name }))} />
          <Button type="submit" variant="secondary">Filter</Button>
        </form>
      </Card>
      <Card>
        {rows.length === 0 ? <EmptyState title="No requests found" /> : (
          <Table caption="HR requests">
            <THead><Th>Request</Th><Th>Type</Th>{all && <Th>Requester</Th>}<Th>Priority</Th><Th>Submitted</Th><Th>Status</Th></THead>
            <TBody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td><Link className="font-medium text-brand-700 underline" href={`/requests/${r.id}`}>{r.request_no}</Link><div className="text-xs text-slate-500">{r.subject}</div></Td>
                  <Td>{typeName(r.request_type_code)}</Td>
                  {all && <Td>{names.get(r.employee_id) ?? "—"}</Td>}
                  <Td>{r.priority === "normal" ? "Normal" : <Badge tone={r.priority === "urgent" ? "danger" : r.priority === "high" ? "warning" : "neutral"}>{r.priority}</Badge>}</Td>
                  <Td>{fmtDate(r.submitted_at)}</Td>
                  <Td><RequestStatusBadge status={r.status} kind="hr_request" /></Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
        <Pagination basePath="/requests" params={{ scope: sp.scope, status: sp.status, type: sp.type }} page={page} pageSize={PAGE} total={count ?? 0} />
      </Card>
    </>
  );
}
