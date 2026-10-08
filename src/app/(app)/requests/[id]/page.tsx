import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/lib/auth/session";
import { getLookups } from "@/lib/data/lookups";
import { getHrRequest, getRequester } from "@/lib/data/requests";
import { listDocuments } from "@/lib/data/documents";
import { Alert, Badge, Card, CardBody, CardHeader, DefList, PageHeader } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { RequestStatusBadge } from "@/components/ui/status";
import { ActionForm, InlineAction, SubmitButton } from "@/components/ui/action-form";
import { FormGrid, SelectField } from "@/components/ui/form";
import { HrRequestForm } from "@/components/requests/hr-request-form";
import { UploadForm } from "@/components/documents/upload-form";
import { WorkflowPanel } from "@/components/requests/workflow-panel";
import { assignHrRequest, attachResult, deleteHrDraft } from "../actions";
import { fmtDate, fmtDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "HR request" };

export default async function RequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const ctx = await requireCtx();
  const r = await getHrRequest(ctx, id);
  const [lookups, requester] = await Promise.all([getLookups(ctx), getRequester(ctx, r.employee_id)]);
  const type = lookups.requestTypes.find((t) => t.code === r.request_type_code);
  const isRequester = ctx.employeeId === r.employee_id;
  const open = r.status === "in_review" || r.status === "approved";
  const processing = ctx.can("request.process") && open;

  const [staff, empDocs, assignee] = await Promise.all([
    processing ? ctx.db.rpc("assignable_staff") : Promise.resolve({ data: [] as { user_id: string; display_name: string }[] }),
    processing && type?.produces_document ? listDocuments(ctx, r.employee_id) : Promise.resolve([]),
    r.assigned_to && ctx.can("request.read_all") ? ctx.db.rpc("assignable_staff") : Promise.resolve({ data: [] as { user_id: string; display_name: string }[] }),
  ]);
  const assignedName = assignee.data?.find((s) => s.user_id === r.assigned_to)?.display_name;
  const resultDoc = r.result_document_id ? (await listDocuments(ctx, r.employee_id)).find((d) => d.id === r.result_document_id) : undefined;

  return (
    <>
      <PageHeader title={r.request_no} description={<>{type?.name} · <RequestStatusBadge status={r.status} kind="hr_request" /></>} />
      {error && <div className="mb-4"><Alert tone="warning">{error}</Alert></div>}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader title="Request details" />
            <CardBody>
              <DefList items={[
                ["Requester", requester?.full_name], ["Request type", type?.name], ["Subject", r.subject],
                ["Priority", <Badge key="p" tone={r.priority === "urgent" ? "danger" : r.priority === "high" ? "warning" : "neutral"}>{r.priority}</Badge>],
                ["Date submitted", r.submitted_at ? fmtDateTime(r.submitted_at) : "Not yet"], ["Assigned staff", assignedName],
                ["Completion date", r.completed_at ? fmtDate(r.completed_at) : null], ["Details", r.details],
              ]} />
            </CardBody>
          </Card>

          {resultDoc && (
            <Card className="border-emerald-300">
              <CardHeader title="Released document" />
              <CardBody className="flex flex-wrap items-center justify-between gap-3">
                <div><p className="font-medium">{resultDoc.title}</p><p className="text-xs text-slate-500">{resultDoc.doc_no}</p></div>
                {r.status === "completed" || ctx.can("document.read_all") ? (
                  <div className="flex gap-2"><LinkButton href={`/documents/${resultDoc.id}/file`} target="_blank" variant="secondary">View</LinkButton><LinkButton href={`/documents/${resultDoc.id}/file?download=1`}>Download</LinkButton></div>
                ) : <span className="text-sm text-slate-500">Available once released.</span>}
              </CardBody>
            </Card>
          )}

          {r.status === "draft" && isRequester && (
            <Card>
              <CardHeader title="Edit draft" />
              <CardBody className="space-y-4">
                <HrRequestForm lookups={lookups} existing={r} />
                <InlineAction action={deleteHrDraft} hidden={{ id: r.id }}><SubmitButton variant="ghost" confirm="Delete this draft?">Delete draft</SubmitButton></InlineAction>
              </CardBody>
            </Card>
          )}

          {processing && (
            <Card>
              <CardHeader title="HR processing" />
              <CardBody className="space-y-6">
                <ActionForm action={assignHrRequest} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="request_id" value={r.id} />
                  <div className="min-w-56 flex-1"><SelectField label="Assign to" name="user_id" required defaultValue={r.assigned_to ?? ""} placeholder="Select staff…" options={(staff.data ?? []).map((s) => ({ value: s.user_id, label: s.display_name }))} /></div>
                  <SubmitButton variant="secondary">Assign</SubmitButton>
                </ActionForm>
                {type?.produces_document && (
                  <div className="space-y-4 border-t border-line pt-4">
                    <p className="text-sm font-medium text-slate-800">Generated document {r.result_document_id ? "✔ linked" : "(required before release)"}</p>
                    <details>
                      <summary className="cursor-pointer text-sm font-medium text-brand-700">Upload the generated document to the employee&apos;s folder</summary>
                      <div className="mt-3"><UploadForm employeeId={r.employee_id} lookups={lookups} categoryCodes={["COE", "SERVICE_RECORD", "OTHER"]} returnTo={`/requests/${r.id}`} compact /></div>
                    </details>
                    <ActionForm action={attachResult} className="flex flex-wrap items-end gap-3">
                      <input type="hidden" name="request_id" value={r.id} />
                      <div className="min-w-56 flex-1"><SelectField label="Link as the released document" name="document_id" required defaultValue={r.result_document_id ?? ""} placeholder="Select a document…" options={empDocs.filter((d) => !d.related_entity_id).map((d) => ({ value: d.id, label: `${d.doc_no} — ${d.title}` }))} /></div>
                      <SubmitButton variant="secondary">Link document</SubmitButton>
                    </ActionForm>
                  </div>
                )}
              </CardBody>
            </Card>
          )}
        </div>
        <div className="lg:col-span-2">
          <WorkflowPanel ctx={ctx} lookups={lookups} type="hr_request" id={r.id} employeeId={r.employee_id} status={r.status}
            workflowCode={r.workflow_code} currentStep={r.current_step_order} returnTo={`/requests/${r.id}`} attachments={{ enabled: true }} />
        </div>
      </div>
      <p className="mt-6 text-xs text-slate-400"><Link href="/requests" className="underline">Back to requests</Link></p>
    </>
  );
}
