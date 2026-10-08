import Link from "next/link";
import type { Ctx } from "@/lib/auth/session";
import { getMyDashboard } from "@/lib/data/dashboard";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/charts";
import { RequestStatusBadge, AttendanceBadge } from "@/components/ui/status";
import { Table, TBody, Td, THead, Th } from "@/components/ui/table";
import { fmtDate, fmtDateTime, fmtNumber, fmtTime, greeting } from "@/lib/format";
import { getLookups } from "@/lib/data/lookups";

export async function EmployeeView({ ctx, employeeId }: { ctx: Ctx; employeeId: string }) {
  const [d, lookups] = await Promise.all([getMyDashboard(ctx, employeeId), getLookups(ctx)]);
  const firstName = d.directory?.first_name ?? ctx.displayName.split(" ")[0];
  const missingItems = d.completion.items.filter((i) => !i.done);
  const recent = [
    ...d.leave.map((r) => ({ kind: "leave_application" as const, id: r.id, no: r.request_no, title: `${lookups.leaveTypes.find((t) => t.code === r.leave_type_code)?.name ?? "Leave"} (${fmtDate(r.date_from)}${r.date_to !== r.date_from ? ` – ${fmtDate(r.date_to)}` : ""})`, status: r.status, at: r.created_at, href: `/leave/${r.id}` })),
    ...d.corrections.map((r) => ({ kind: "attendance_correction" as const, id: r.id, no: r.request_no, title: `Attendance correction — ${fmtDate(r.work_date)}`, status: r.status, at: r.created_at, href: `/attendance/corrections/${r.id}` })),
    ...d.requests.map((r) => ({ kind: "hr_request" as const, id: r.id, no: r.request_no, title: r.subject, status: r.status, at: r.created_at, href: `/requests/${r.id}` })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-brand-900">{greeting()}, {firstName}</h1>
        <p className="text-sm text-slate-600">
          {d.directory?.position_title ?? "—"} · {d.directory?.unit_name ?? d.directory?.division_name ?? "—"} · {d.directory?.employee_no}
        </p>
      </div>

      {d.missingLogs.length > 0 && (
        <Alert tone="warning" title={`You have ${d.missingLogs.length} attendance day(s) with a missing log this month`}>
          <Link href="/attendance" className="underline">Review your DTR</Link> and file a correction if needed.
        </Alert>
      )}

      {d.expiringDocuments.length > 0 && (
        <Alert tone="warning" title={`${d.expiringDocuments.length} document(s) expired or expiring within 30 days`}>
          {d.expiringDocuments.slice(0, 3).map((x) => `${x.title} (${fmtDate(x.expires_on)})`).join(" · ")} — <Link href="/documents" className="underline">upload a renewed copy</Link>.
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardBody>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Profile completion</p>
            <p className="mt-1 text-3xl font-semibold text-brand-900">{d.completion.percent}%</p>
            <div className="mt-2"><ProgressBar percent={d.completion.percent} label="Profile completion" /></div>
            {missingItems.length > 0 && <p className="mt-2 text-xs text-slate-500">Next: {missingItems[0].label}</p>}
            <div className="mt-3"><LinkButton href="/profile" size="sm">Update profile</LinkButton></div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Today&apos;s attendance</p>
            {d.today ? (
              <>
                <p className="mt-1 text-3xl font-semibold text-brand-900">{fmtTime(d.today.time_in)}</p>
                <div className="mt-2">
                  <AttendanceBadge code={d.today.status_code} name={lookups.attendanceStatuses.find((s) => s.code === d.today!.status_code)?.name ?? d.today.status_code} />
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-600">No log recorded yet today.</p>
            )}
            <div className="mt-3"><LinkButton href="/attendance" variant="secondary" size="sm">View DTR</LinkButton></div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Leave balance</p>
            {d.balances.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">No balances recorded for this year.</p>
            ) : (
              <p className="mt-2 flex flex-wrap gap-x-4 text-xl font-semibold text-brand-900">
                {d.balances.map((b) => (
                  <span key={b.leave_type_code}>{b.leave_type_code} {fmtNumber(b.available, 1)}</span>
                ))}
              </p>
            )}
            <div className="mt-3"><LinkButton href="/leave/new" variant="secondary" size="sm">File leave</LinkButton></div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Pending requests</p>
            <p className="mt-1 text-3xl font-semibold text-brand-900">{d.pendingCount}</p>
            <p className="text-xs text-slate-500">awaiting a decision or HR action</p>
            <div className="mt-3"><LinkButton href="/requests/new" variant="secondary" size="sm">Request certificate</LinkButton></div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Quick actions" />
        <CardBody className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["/profile", "Update profile"], ["/pds", "View PDS"], ["/leave/new", "File leave"], ["/attendance", "View DTR"],
            ["/requests/new", "Request certificate"], ["/documents", "Upload document"], ["/service-record", "View service record"],
            ["/attendance/corrections/new", "Request DTR correction"],
          ].map(([href, label]) => (
            <Link key={href} href={href} className="rounded-md border border-line px-3 py-2 text-sm font-medium text-brand-800 hover:bg-brand-50">{label}</Link>
          ))}
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Recent requests" actions={<Link href="/requests" className="text-sm text-brand-700 underline">All requests</Link>} />
          {recent.length === 0 ? (
            <EmptyState title="No requests yet">Leave, DTR corrections and HR requests will appear here.</EmptyState>
          ) : (
            <Table caption="Recent requests">
              <THead><Th>Request</Th><Th>Details</Th><Th>Status</Th></THead>
              <TBody>
                {recent.map((r) => (
                  <tr key={`${r.kind}-${r.id}`}>
                    <Td><Link className="font-medium text-brand-700 underline" href={r.href}>{r.no}</Link><div className="text-xs text-slate-500">{fmtDate(r.at)}</div></Td>
                    <Td>{r.title}</Td>
                    <Td><RequestStatusBadge status={r.status} kind={r.kind} /></Td>
                  </tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Notifications" actions={<Link href="/notifications" className="text-sm text-brand-700 underline">View all</Link>} />
          {d.notifications.length === 0 && missingItems.length === 0 ? (
            <EmptyState title="You're all caught up" />
          ) : (
            <ul className="divide-y divide-line">
              {d.notifications.map((n) => (
                <li key={n.id} className="px-4 py-3">
                  <p className="text-sm font-medium text-slate-900">
                    {!n.read_at && <Badge tone="info">New</Badge>}{" "}
                    {n.link ? <Link href={n.link} className="underline">{n.title}</Link> : n.title}
                  </p>
                  {n.body && <p className="text-xs text-slate-600">{n.body}</p>}
                  <p className="text-xs text-slate-500">{fmtDateTime(n.created_at)}</p>
                </li>
              ))}
              {missingItems.length > 0 && (
                <li className="px-4 py-3">
                  <p className="text-sm font-medium text-slate-900">Profile information incomplete</p>
                  <p className="text-xs text-slate-600">{missingItems.slice(0, 3).map((i) => i.label).join(" · ")}{missingItems.length > 3 ? ` · +${missingItems.length - 3} more` : ""}</p>
                </li>
              )}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
