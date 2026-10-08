import type { Metadata } from "next";
import { requireCtx } from "@/lib/auth/session";
import { getLookups } from "@/lib/data/lookups";
import { getCorrection, getRequester } from "@/lib/data/requests";
import { Alert, Card, CardBody, CardHeader, DefList, PageHeader } from "@/components/ui/primitives";
import { RequestStatusBadge } from "@/components/ui/status";
import { ActionForm, InlineAction, SubmitButton } from "@/components/ui/action-form";
import { CorrectionForm, CORRECTION_TYPES } from "@/components/attendance/correction-form";
import { WorkflowPanel } from "@/components/requests/workflow-panel";
import { deleteCorrectionDraft } from "../actions";
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/format";

export const metadata: Metadata = { title: "Attendance correction" };

export default async function CorrectionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const ctx = await requireCtx();
  const c = await getCorrection(ctx, id);
  const [lookups, requester, { data: dtr }] = await Promise.all([
    getLookups(ctx),
    getRequester(ctx, c.employee_id),
    ctx.db.from("attendance_records").select("*").eq("employee_id", c.employee_id).eq("work_date", c.work_date).maybeSingle(),
  ]);
  const isRequester = ctx.employeeId === c.employee_id;

  return (
    <>
      <PageHeader title={c.request_no} description={<>Attendance correction · <RequestStatusBadge status={c.status} kind="attendance_correction" /></>} />
      {error && <div className="mb-4"><Alert tone="warning">{error}</Alert></div>}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader title="Request" />
            <CardBody>
              <DefList items={[
                ["Employee", requester?.full_name], ["Date affected", fmtDate(c.work_date)],
                ["Correction needed", CORRECTION_TYPES.find((t) => t.value === c.correction_type)?.label],
                ["Correct time in", c.proposed_time_in ? fmtTime(c.proposed_time_in) : null], ["Correct time out", c.proposed_time_out ? fmtTime(c.proposed_time_out) : null],
                ["Submitted", c.submitted_at ? fmtDateTime(c.submitted_at) : "Not yet"],
                ["Reason", c.reason], ["Remarks", c.remarks],
              ]} />
              <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm">
                <p className="font-medium text-slate-700">Current DTR for that day</p>
                {dtr ? <p>Time in {fmtTime(dtr.time_in)} · Time out {fmtTime(dtr.time_out)} · {lookups.attendanceStatuses.find((s) => s.code === dtr.status_code)?.name}</p> : <p className="text-slate-500">No log recorded.</p>}
              </div>
            </CardBody>
          </Card>
          {c.status === "draft" && isRequester && (
            <Card>
              <CardHeader title="Edit draft" />
              <CardBody className="space-y-4">
                <CorrectionForm existing={c} />
                <InlineAction action={deleteCorrectionDraft} hidden={{ id: c.id }}><SubmitButton variant="ghost" confirm="Delete this draft?">Delete draft</SubmitButton></InlineAction>
              </CardBody>
            </Card>
          )}
        </div>
        <div className="lg:col-span-2">
          <WorkflowPanel ctx={ctx} lookups={lookups} type="attendance_correction" id={c.id} employeeId={c.employee_id} status={c.status}
            workflowCode={c.workflow_code} currentStep={c.current_step_order} returnTo={`/attendance/corrections/${c.id}`} attachments={{ enabled: true }} />
        </div>
      </div>
    </>
  );
}
