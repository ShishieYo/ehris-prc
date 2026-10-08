import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/lib/auth/session";
import { getLookups } from "@/lib/data/lookups";
import { getTeamDay } from "@/lib/data/attendance";
import { Card, EmptyState, NoAccess, PageHeader } from "@/components/ui/primitives";
import { AttendanceBadge } from "@/components/ui/status";
import { Table, TBody, Td, THead, Th } from "@/components/ui/table";
import { fmtDate, fmtDuration, fmtTime, todayManila } from "@/lib/format";

export const metadata: Metadata = { title: "Team attendance" };

export default async function TeamAttendancePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const ctx = await requireCtx();
  if (!ctx.canAny("attendance.read_all", "team.view")) return <NoAccess />;
  const { date: d } = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(d ?? "") ? d! : todayManila();
  const [lookups, { records, people }] = await Promise.all([getLookups(ctx), getTeamDay(ctx, date)]);
  const rec = new Map(records.map((r) => [r.employee_id, r]));
  const rows = people.filter((p) => p.id && p.id !== ctx.employeeId);
  const name = (c: string) => lookups.attendanceStatuses.find((s) => s.code === c)?.name ?? c;

  return (
    <>
      <PageHeader title="Team attendance" description={ctx.can("attendance.read_all") ? "All personnel." : "Employees in your office or unit."} />
      <form className="mb-4 flex items-end gap-2" aria-label="Choose date">
        <div><label htmlFor="d" className="mb-1 block text-sm font-medium">Date</label><input id="d" type="date" name="date" defaultValue={date} className="rounded-md border border-slate-300 px-3 py-2 text-sm" /></div>
        <button className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white">Show</button>
      </form>
      <Card>
        {rows.length === 0 ? <EmptyState title="No employees to show" /> : (
          <Table caption={`Attendance on ${fmtDate(date)}`}>
            <THead><Th>Employee</Th><Th>Unit</Th><Th>Time in</Th><Th>Time out</Th><Th>Total</Th><Th>Status</Th></THead>
            <TBody>
              {rows.map((p) => {
                const r = rec.get(p.id!);
                return (
                  <tr key={p.id}>
                    <Td><Link className="text-brand-700 underline" href={`/attendance?employee=${p.id}`}>{p.full_name}</Link><div className="text-xs text-slate-500">{p.employee_no}</div></Td>
                    <Td>{p.unit_name ?? p.division_name}</Td>
                    <Td>{fmtTime(r?.time_in)}</Td><Td>{fmtTime(r?.time_out)}</Td><Td>{fmtDuration(r?.total_minutes)}</Td>
                    <Td>{r ? <AttendanceBadge code={r.status_code} name={name(r.status_code)} /> : <span className="text-slate-500">No log</span>}</Td>
                  </tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
