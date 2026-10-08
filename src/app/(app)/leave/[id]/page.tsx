import type { Metadata } from "next";
import { requireCtx } from "@/lib/auth/session";
import { getLookups } from "@/lib/data/lookups";
import { getLeave, getRequester } from "@/lib/data/requests";
import { Alert, Card, CardBody, CardHeader, DefList, PageHeader } from "@/components/ui/primitives";
import { RequestStatusBadge } from "@/components/ui/status";
import { InlineAction, SubmitButton } from "@/components/ui/action-form";
import { LeaveForm } from "@/components/leave/leave-form";
import { WorkflowPanel } from "@/components/requests/workflow-panel";
import { deleteLeaveDraft } from "../actions";
import { fmtDate, fmtDateTime, fmtNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Leave application" };

export default async function LeaveDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const ctx = await requireCtx();
  const a = await getLeave(ctx, id);
  const [lookups, requester] = await Promise.all([getLookups(ctx), getRequester(ctx, a.employee_id)]);
  const isRequester = ctx.employeeId === a.employee_id;

  return (
    <>
      <PageHeader title={a.request_no} description={<>Leave application · <RequestStatusBadge status={a.status} kind="leave_application" /></>} />
      {error && <div className="mb-4"><Alert tone="warning">{error}</Alert></div>}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader title="Application" />
            <CardBody>
              <DefList items={[
                ["Employee", requester?.full_name], ["Leave type", lookups.leaveTypes.find((t) => t.code === a.leave_type_code)?.name],
                ["From", fmtDate(a.date_from)], ["To", fmtDate(a.date_to)], ["Days", fmtNumber(a.days, 2)],
                ["Submitted", a.submitted_at ? fmtDateTime(a.submitted_at) : "Not yet"], ["Reason", a.reason],
              ]} />
            </CardBody>
          </Card>
          {a.status === "draft" && isRequester && (
            <Card>
              <CardHeader title="Edit draft" />
              <CardBody className="space-y-4">
                <LeaveForm lookups={lookups} existing={a} />
                <InlineAction action={deleteLeaveDraft} hidden={{ id: a.id }}><SubmitButton variant="ghost" confirm="Delete this draft?">Delete draft</SubmitButton></InlineAction>
              </CardBody>
            </Card>
          )}
        </div>
        <div className="lg:col-span-2">
          <WorkflowPanel ctx={ctx} lookups={lookups} type="leave_application" id={a.id} employeeId={a.employee_id} status={a.status}
            workflowCode={a.workflow_code} currentStep={a.current_step_order} returnTo={`/leave/${a.id}`} attachments={{ enabled: true }} />
        </div>
      </div>
    </>
  );
}
