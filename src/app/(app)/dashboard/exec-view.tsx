import type { Ctx } from "@/lib/auth/session";
import { getExecDashboard } from "@/lib/data/dashboard";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/primitives";
import { BarList, Donut } from "@/components/ui/charts";
import { fmtDate, fmtNumber, titleCase } from "@/lib/format";

export async function ExecView({ ctx }: { ctx: Ctx }) {
  const d = await getExecDashboard(ctx);
  const m = d.attendance_month;
  const pct = (n: number) => (m.days_recorded ? `${fmtNumber((n / m.days_recorded) * 100, 1)}%` : "—");
  const pendingTotal = d.pending_requests.leave + d.pending_requests.attendance_corrections + d.pending_requests.hr_requests;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-brand-900">Management dashboard</h1>
        <p className="text-sm text-slate-600">Aggregate indicators only — no personal information is shown here.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total workforce" value={d.total} />
        <Stat label="Pending requests" value={pendingTotal} hint={`${d.pending_requests.leave} leave · ${d.pending_requests.attendance_corrections} DTR · ${d.pending_requests.hr_requests} HR`} />
        <Stat label="Attendance this month" value={pct(m.present)} hint={`present of ${m.days_recorded} logged days`} />
        <Stat label="Late / missing logs" value={`${pct(m.late)} / ${pct(m.missing_log)}`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Personnel by division" /><CardBody><BarList items={d.by_division} /></CardBody></Card>
        <Card><CardHeader title="Personnel by employment status" /><CardBody><Donut label="Personnel by employment status" items={d.by_status} /></CardBody></Card>
        <Card>
          <CardHeader title="Leave utilization" description="Used vs. credited days this year" />
          <CardBody>
            {d.leave_utilization.length === 0 ? <p className="text-sm text-slate-500">No leave balances recorded.</p> : (
              <ul className="space-y-3">
                {d.leave_utilization.map((l) => (
                  <li key={l.leave_type}>
                    <div className="flex justify-between text-sm"><span>{l.leave_type}</span><span className="font-medium">{fmtNumber(l.used, 1)} / {fmtNumber(l.credited, 1)}</span></div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-brand-50"><div className="h-full rounded-full bg-brand-600" style={{ width: `${l.credited ? Math.min(100, (l.used / l.credited) * 100) : 0}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Personnel movements" description="Last 90 days (excluding original appointments)" />
          <CardBody><BarList items={d.movements.map((x) => ({ name: titleCase(x.type), count: x.count }))} /></CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Upcoming service milestones" description="Next 30 days (every 5 years of service)" />
          <CardBody>
            {d.milestones.length === 0 ? <p className="text-sm text-slate-500">None in the next 30 days.</p> : (
              <ul className="divide-y divide-line text-sm">
                {d.milestones.map((x) => (
                  <li key={`${x.name}${x.date}`} className="flex justify-between py-2"><span>{x.name}</span><span className="text-slate-600">{x.years} years · {fmtDate(x.date)}</span></li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
