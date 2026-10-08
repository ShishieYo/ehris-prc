import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/lib/auth/session";
import { listCorrections } from "@/lib/data/attendance";
import { Card, EmptyState, NoAccess, PageHeader } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { RequestStatusBadge } from "@/components/ui/status";
import { Table, TBody, Td, THead, Th } from "@/components/ui/table";
import { fmtDate, titleCase } from "@/lib/format";

export const metadata: Metadata = { title: "Attendance corrections" };

export default async function CorrectionsPage() {
  const ctx = await requireCtx();
  if (!ctx.employeeId) return <NoAccess />;
  const rows = await listCorrections(ctx, ctx.employeeId);
  return (
    <>
      <PageHeader title="My attendance corrections" description="Requests to fix a missing or incorrect time log." actions={<LinkButton href="/attendance/corrections/new">New correction</LinkButton>} />
      <Card>
        {rows.length === 0 ? <EmptyState title="No correction requests">Find a day with a missing log in your DTR and choose Request correction.</EmptyState> : (
          <Table caption="Attendance correction requests">
            <THead><Th>Request</Th><Th>Date affected</Th><Th>Type</Th><Th>Status</Th></THead>
            <TBody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td><Link className="font-medium text-brand-700 underline" href={`/attendance/corrections/${r.id}`}>{r.request_no}</Link></Td>
                  <Td>{fmtDate(r.work_date)}</Td><Td>{titleCase(r.correction_type)}</Td>
                  <Td><RequestStatusBadge status={r.status} kind="attendance_correction" /></Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
