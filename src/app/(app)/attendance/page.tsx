import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/lib/auth/session";
import { getLookups } from "@/lib/data/lookups";
import { getMonthRecords, monthBounds, shiftMonth, ymOf } from "@/lib/data/attendance";
import { getDirectoryEntry } from "@/lib/data/employees";
import { Card, CardHeader, NoAccess, PageHeader, Stat, Alert } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { AttendanceBadge } from "@/components/ui/status";
import { Table, TBody, Td, THead, Th } from "@/components/ui/table";
import { fmtDuration, fmtMonth, fmtTime, todayManila } from "@/lib/format";

export const metadata: Metadata = { title: "Time & Attendance" };

const WEEKDAY = new Intl.DateTimeFormat("en-PH", { weekday: "short", timeZone: "UTC" });

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ employee?: string; month?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const employeeId = sp.employee ?? ctx.employeeId;
  const today = todayManila();
  const ym = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : ymOf(today);
  const teamAccess = ctx.canAny("attendance.read_all", "team.view");

  if (!employeeId) {
    return teamAccess ? <><PageHeader title="Time & Attendance" /><Alert>See <Link className="underline" href="/attendance/team">team attendance</Link>, or open an employee from Personnel Records.</Alert></> : <NoAccess />;
  }
  const isSelf = employeeId === ctx.employeeId;
  const [lookups, { records, holidays }, person] = await Promise.all([getLookups(ctx), getMonthRecords(ctx, employeeId, ym), getDirectoryEntry(ctx, employeeId)]);
  if (!isSelf && !person) return <NoAccess />;

  const byDate = new Map(records.map((r) => [r.work_date, r]));
  const holiday = new Map(holidays.map((h) => [h.holiday_date, h.name]));
  const { days } = monthBounds(ym);
  const statusName = (c: string) => lookups.attendanceStatuses.find((s) => s.code === c)?.name ?? c;
  const count = (code: string) => records.filter((r) => r.status_code === code).length;
  const totalMinutes = records.reduce((s, r) => s + (r.total_minutes ?? 0), 0);
  const q = (m: string) => `/attendance?month=${m}${sp.employee ? `&employee=${sp.employee}` : ""}`;

  return (
    <>
      <PageHeader
        title={isSelf ? "My Daily Time Record" : `DTR — ${person?.full_name}`}
        description={fmtMonth(`${ym}-01`)}
        actions={<>
          {teamAccess && <LinkButton href="/attendance/team" variant="secondary">Team attendance</LinkButton>}
          {isSelf && <LinkButton href="/attendance/corrections" variant="secondary">My corrections</LinkButton>}
          {isSelf && <LinkButton href="/attendance/corrections/new">Request correction</LinkButton>}
        </>}
      />
      <div className="mb-4 flex items-center gap-3 text-sm">
        <Link className="rounded-md border border-slate-300 bg-white px-3 py-1" href={q(shiftMonth(ym, -1))}>← Previous</Link>
        <Link className="rounded-md border border-slate-300 bg-white px-3 py-1" href={q(ymOf(today))}>This month</Link>
        <Link className="rounded-md border border-slate-300 bg-white px-3 py-1" href={q(shiftMonth(ym, 1))}>Next →</Link>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Present" value={count("PRESENT")} />
        <Stat label="Late" value={count("LATE")} tone={count("LATE") ? "warning" : undefined} />
        <Stat label="Missing logs" value={count("MISSING_LOG")} tone={count("MISSING_LOG") ? "danger" : undefined} />
        <Stat label="Absent" value={count("ABSENT")} tone={count("ABSENT") ? "danger" : undefined} />
        <Stat label="Total hours" value={fmtDuration(totalMinutes)} />
      </div>
      <Card>
        <CardHeader title="Daily records" />
        <Table caption={`Daily time record for ${fmtMonth(`${ym}-01`)}`}>
          <THead><Th>Date</Th><Th>Time in</Th><Th>Time out</Th><Th>Break</Th><Th>Total</Th><Th>Status</Th><Th>Remarks</Th>{isSelf && <Th><span className="sr-only">Action</span></Th>}</THead>
          <TBody>
            {Array.from({ length: days }, (_, i) => {
              const date = `${ym}-${String(i + 1).padStart(2, "0")}`;
              const rec = byDate.get(date);
              const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
              const weekend = dow === 0 || dow === 6;
              const future = date > today;
              if (!rec && (weekend || future) && !holiday.has(date)) return null;
              const needsFix = isSelf && date <= today && (!rec ? !weekend && !holiday.has(date) : ["MISSING_LOG", "ABSENT", "LATE", "UNDERTIME"].includes(rec.status_code));
              return (
                <tr key={date} className={weekend ? "bg-slate-50" : undefined}>
                  <Td className="whitespace-nowrap font-medium">{date.slice(8)} <span className="text-xs text-slate-500">{WEEKDAY.format(new Date(`${date}T12:00:00Z`))}</span></Td>
                  <Td>{fmtTime(rec?.time_in)}</Td>
                  <Td>{fmtTime(rec?.time_out)}</Td>
                  <Td>{rec ? `${rec.break_minutes} min` : "—"}</Td>
                  <Td>{fmtDuration(rec?.total_minutes)}</Td>
                  <Td>{rec ? <AttendanceBadge code={rec.status_code} name={statusName(rec.status_code)} /> : holiday.has(date) ? <AttendanceBadge code="HOLIDAY" name={`Holiday: ${holiday.get(date)}`} /> : <span className="text-slate-500">No log</span>}</Td>
                  <Td className="text-xs text-slate-600">{rec?.remarks ?? ""}</Td>
                  {isSelf && <Td>{needsFix && <Link className="text-brand-700 underline" href={`/attendance/corrections/new?date=${date}&type=${rec?.status_code === "MISSING_LOG" && !rec.time_out ? "missing_time_out" : !rec ? "absent_but_present" : "incorrect_time"}`}>Request correction</Link>}</Td>}
                </tr>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
