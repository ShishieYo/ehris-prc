import Link from "next/link";
import type { Ctx } from "@/lib/auth/session";
import { getHrDashboard } from "@/lib/data/dashboard";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/primitives";
import { BarList, Donut } from "@/components/ui/charts";
import { fmtNumber } from "@/lib/format";

export async function HrView({ ctx }: { ctx: Ctx }) {
  const d = await getHrDashboard(ctx);
  const a = d.attendance_today;
  const pending: [string, number, string][] = [
    ["Leave requests", d.pending.leave, "/approvals"],
    ["Attendance deficiencies", d.pending.attendance_corrections, "/approvals"],
    ["HR service requests", d.pending.hr_requests, "/requests"],
    ["Documents for review", d.pending.documents_for_review, "/documents"],
    ["PDS awaiting verification", d.pending.pds_for_review, "/personnel"],
  ];
  const statusCount = (code: string) => d.by_status.find((s) => s.code === code)?.count ?? 0;
  const other = d.total - ["PERMANENT", "TEMPORARY", "COS", "JO"].reduce((s, c) => s + statusCount(c), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-brand-900">HR overview</h1>
        <p className="text-sm text-slate-600">What needs attention, and how complete and accurate our records are.</p>
      </div>

      <section aria-labelledby="ws">
        <h2 id="ws" className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Workforce summary</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Stat label="Total personnel" value={d.total} />
          <Stat label="Permanent" value={statusCount("PERMANENT")} />
          <Stat label="Temporary" value={statusCount("TEMPORARY")} />
          <Stat label="COS" value={statusCount("COS")} />
          <Stat label="JO" value={statusCount("JO")} />
          <Stat label="Other" value={other} />
        </div>
      </section>

      <section aria-labelledby="att">
        <h2 id="att" className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Today&apos;s attendance ({a.recorded} logs)</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Present" value={a.present} />
          <Stat label="Late" value={a.late} tone={a.late ? "warning" : undefined} />
          <Stat label="Missing logs" value={a.missing_log} tone={a.missing_log ? "danger" : undefined} />
          <Stat label="Absent" value={a.absent} tone={a.absent ? "danger" : undefined} />
          <Stat label="On leave" value={a.on_leave} />
        </div>
      </section>

      <Card>
        <CardHeader title="Pending actions" />
        <ul className="grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-5">
          {pending.map(([label, n, href]) => (
            <li key={label} className="p-4">
              <Link href={href} className="block hover:underline">
                <span className="text-2xl font-semibold text-brand-900">{n}</span>
                <span className="block text-sm text-slate-600">{label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Personnel by division" /><CardBody><BarList items={d.by_division} /></CardBody></Card>
        <Card><CardHeader title="Personnel by employment status" /><CardBody><Donut label="Personnel by employment status" items={d.by_status.map((s) => ({ name: s.name, count: s.count }))} /></CardBody></Card>
        <Card className="lg:col-span-2"><CardHeader title="Top positions" description={`Most common of ${fmtNumber(d.by_position.length, 0)} shown`} /><CardBody><BarList items={d.by_position} /></CardBody></Card>
      </div>
    </div>
  );
}
