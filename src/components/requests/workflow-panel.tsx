import type { Ctx } from "@/lib/auth/session";
import type { EntityType } from "@/lib/db/types";
import { getTimeline, getWorkflowSteps, canActOn } from "@/lib/data/workflow";
import { getRelatedDocuments } from "@/lib/data/requests";
import type { Lookups } from "@/lib/data/lookups";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { TextAreaField } from "@/components/ui/form";
import { Alert, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { StepTracker, Timeline } from "@/components/ui/timeline";
import { UploadForm } from "@/components/documents/upload-form";
import { DocumentStatusBadge } from "@/components/ui/status";
import { actOnRequest, commentOnRequest, submitRequest } from "@/app/(app)/workflow-actions";
import Link from "next/link";

type Props = {
  ctx: Ctx;
  lookups: Lookups;
  type: EntityType;
  id: string;
  employeeId: string;
  status: string;
  workflowCode: string | null;
  currentStep: number | null;
  returnTo: string;
  /** Allow the requester to attach supporting files while the request is still a draft or open. */
  attachments?: { enabled: boolean; categories?: string[] };
};

/** Progress, attachments, timeline and the actions available to the signed-in user. */
export async function WorkflowPanel({ ctx, lookups, type, id, employeeId, status, workflowCode, currentStep, returnTo, attachments }: Props) {
  const [steps, timeline, docs, canAct] = await Promise.all([
    getWorkflowSteps(ctx, workflowCode),
    getTimeline(ctx, type, id),
    getRelatedDocuments(ctx, type, id),
    status === "in_review" || status === "approved" ? canActOn(ctx, type, id) : Promise.resolve(false),
  ]);
  const isRequester = ctx.employeeId === employeeId;
  const open = status === "in_review" || (status === "approved" && currentStep !== null);
  const finished = ["completed", "approved"].includes(status) && currentStep === null;
  const failed = status === "rejected" || status === "cancelled";
  const stepName = steps.find((s) => s.step_order === currentStep)?.name;
  const canCancel = isRequester && (status === "draft" || open);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Progress" description={open && stepName ? `Waiting at: ${stepName}` : undefined} />
        <CardBody className="space-y-5">
          {status === "draft" ? (
            <p className="text-sm text-slate-600">This is a draft. It enters the approval workflow when you submit it.</p>
          ) : (
            <StepTracker steps={steps.map((s) => ({ order: s.step_order, name: s.name }))} currentOrder={currentStep} finished={finished} failed={failed} />
          )}
          {status === "rejected" && <Alert tone="danger" title="This request was not approved">See the remarks in the timeline below.</Alert>}
          {status === "cancelled" && <Alert tone="info">This request was cancelled.</Alert>}
        </CardBody>
      </Card>

      {(docs.length > 0 || attachments?.enabled) && (
        <Card>
          <CardHeader title="Attachments" />
          <CardBody className="space-y-4">
            {docs.length === 0 ? <p className="text-sm text-slate-500">No attachments.</p> : (
              <ul className="divide-y divide-line text-sm">
                {docs.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                    <Link className="text-brand-700 underline" href={`/documents/${d.id}`}>{d.title}</Link>
                    <span className="flex items-center gap-2 text-xs text-slate-500">
                      {lookups.documentCategories.find((c) => c.code === d.category_code)?.name}
                      <DocumentStatusBadge status={d.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {attachments?.enabled && (status === "draft" || open) && isRequester && (
              <details>
                <summary className="cursor-pointer text-sm font-medium text-brand-700">Attach a supporting document</summary>
                <div className="mt-3"><UploadForm employeeId={employeeId} lookups={lookups} categoryCodes={attachments.categories ?? ["SUPPORTING"]} related={{ type, id }} returnTo={returnTo} compact /></div>
              </details>
            )}
          </CardBody>
        </Card>
      )}

      {status === "draft" && isRequester && (
        <Card>
          <CardHeader title="Submit" />
          <CardBody>
            <ActionForm action={submitRequest}>
              <input type="hidden" name="entity_type" value={type} />
              <input type="hidden" name="entity_id" value={id} />
              <SubmitButton pendingText="Submitting…">Submit for approval</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
      )}

      {canAct && (
        <Card className="border-brand-300">
          <CardHeader title="Your decision" description={stepName} />
          <CardBody>
            <ActionForm action={actOnRequest}>
              <input type="hidden" name="entity_type" value={type} />
              <input type="hidden" name="entity_id" value={id} />
              <TextAreaField label="Remarks" name="remarks" hint="Required when rejecting or returning." />
              <div className="flex flex-wrap gap-2">
                <SubmitButton name="action" value="approve">Approve</SubmitButton>
                <SubmitButton name="action" value="return" variant="secondary">Return for revision</SubmitButton>
                <SubmitButton name="action" value="reject" variant="danger" confirm="Reject this request?">Reject</SubmitButton>
              </div>
            </ActionForm>
          </CardBody>
        </Card>
      )}

      {canCancel && (
        <Card>
          <CardBody>
            <ActionForm action={actOnRequest} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="entity_type" value={type} />
              <input type="hidden" name="entity_id" value={id} />
              <div className="min-w-60 flex-1"><TextAreaField label="Cancel this request (optional reason)" name="remarks" /></div>
              <SubmitButton name="action" value="cancel" variant="secondary" confirm="Cancel this request?">Cancel request</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Timeline" description="Every step, who did it and when." />
        <CardBody>
          <Timeline entries={timeline} empty="Nothing has happened yet." />
          {status !== "draft" && (
            <ActionForm action={commentOnRequest} className="mt-5 space-y-2 border-t border-line pt-4" resetOnSuccess>
              <input type="hidden" name="entity_type" value={type} />
              <input type="hidden" name="entity_id" value={id} />
              <TextAreaField label="Add a comment" name="remarks" />
              <SubmitButton variant="secondary" size="sm">Post comment</SubmitButton>
            </ActionForm>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
