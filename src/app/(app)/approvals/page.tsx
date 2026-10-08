import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/lib/auth/session";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Table, TBody, Td, THead, Th } from "@/components/ui/table";
import { fmtDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "For my action" };

const LABEL = { leave_application: "Leave", attendance_correction: "Attendance correction", hr_request: "HR request" } as const;
const HREF = { leave_application: "/leave", attendance_correction: "/attendance/corrections", hr_request: "/requests" } as const;

export default async function ApprovalsPage() {
  const ctx = await requireCtx();
  const { data, error } = await ctx.db.rpc("my_pending_actions");
  if (error) throw error;
  const rows = data ?? [];
  return (
    <>
      <PageHeader title="For my action" description="Requests waiting for your decision, oldest first." />
      <Card>
        {rows.length === 0 ? <EmptyState title="Nothing needs your action right now" /> : (
          <Table caption="Requests awaiting your action">
            <THead><Th>Request</Th><Th>Type</Th><Th>Employee</Th><Th>Details</Th><Th>Step</Th><Th>Submitted</Th></THead>
            <TBody>
              {rows.map((r) => (
                <tr key={`${r.entity_type}-${r.entity_id}`}>
                  <Td><Link className="font-medium text-brand-700 underline" href={`${HREF[r.entity_type as keyof typeof HREF]}/${r.entity_id}`}>{r.request_no}</Link></Td>
                  <Td>{LABEL[r.entity_type as keyof typeof LABEL]}</Td>
                  <Td>{r.employee_name}</Td><Td>{r.summary}</Td><Td>{r.step_name}</Td><Td className="whitespace-nowrap">{fmtDateTime(r.submitted_at)}</Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
