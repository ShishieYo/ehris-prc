import type { Metadata } from "next";
import { requireCtx } from "@/lib/auth/session";
import { Alert, Badge, Card, CardBody, CardHeader, NoAccess, PageHeader } from "@/components/ui/primitives";
import { ActionForm, InlineAction, SubmitButton } from "@/components/ui/action-form";
import { FormGrid, SelectField, TextField } from "@/components/ui/form";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { deleteStep, saveStep, toggleWorkflow } from "./actions";

export const metadata: Metadata = { title: "Workflows" };

const KIND = { leave_application: "Leave", attendance_correction: "Attendance correction", hr_request: "HR request" } as const;

function StepForm({ code, step }: { code: string; step?: { id: string; step_order: number; name: string; actor_kind: string; required_permission: string | null; status_on_approve: string } }) {
  return (
    <ActionForm action={saveStep} className="space-y-3" key={step?.id ?? `new-${code}`}>
      <input type="hidden" name="workflow_code" value={code} />
      <input type="hidden" name="step_id" value={step?.id ?? ""} />
      <FormGrid cols={3}>
        <TextField label="Step no." name="step_order" type="number" min={1} required defaultValue={step?.step_order ?? ""} />
        <TextField label="Status label while pending" name="name" required defaultValue={step?.name ?? ""} />
        <SelectField label="Who acts" name="actor_kind" defaultValue={step?.actor_kind ?? "permission"} options={[{ value: "supervisor", label: "Requester's supervisor / head of office" }, { value: "permission", label: "Staff holding a permission" }]} />
        <SelectField label="Permission (if staff)" name="required_permission" placeholder="—" defaultValue={step?.required_permission ?? ""} options={PERMISSIONS.map((p) => ({ value: p, label: p }))} />
        <SelectField label="Status after approval" name="status_on_approve" defaultValue={step?.status_on_approve ?? "in_review"} options={[{ value: "in_review", label: "In review (more steps follow)" }, { value: "approved", label: "Approved" }, { value: "completed", label: "Completed (final)" }]} />
      </FormGrid>
      <SubmitButton size="sm">{step ? "Save step" : "Add step"}</SubmitButton>
    </ActionForm>
  );
}

export default async function WorkflowsPage() {
  const ctx = await requireCtx();
  if (!ctx.can("workflow.configure")) return <NoAccess />;
  const [wf, steps, inflight] = await Promise.all([
    ctx.db.from("workflows").select("*").order("entity_type"),
    ctx.db.from("workflow_steps").select("*").order("workflow_code").order("step_order"),
    Promise.all([
      ctx.db.from("leave_applications").select("workflow_code").in("status", ["in_review", "approved"]),
      ctx.db.from("attendance_corrections").select("workflow_code").in("status", ["in_review", "approved"]),
      ctx.db.from("hr_requests").select("workflow_code").in("status", ["in_review", "approved"]),
    ]),
  ]);
  if (wf.error) throw wf.error;
  if (steps.error) throw steps.error;
  const open = inflight.flatMap((r) => r.data ?? []).reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.workflow_code ?? ""]: (acc[r.workflow_code ?? ""] ?? 0) + 1 }), {});

  return (
    <>
      <PageHeader title="Workflows" description="Approval routes are configuration, not code. Each step is acted on either by the requester's supervisor or by staff holding a permission." />
      <div className="space-y-6">
        <Alert tone="warning" title="Changing a workflow">Requests already in progress follow the live steps. Avoid renumbering or removing a step while requests are waiting on it.</Alert>
        {(wf.data ?? []).map((w) => (
          <Card key={w.code}>
            <CardHeader title={w.name} description={`${KIND[w.entity_type as keyof typeof KIND]} · ${w.description ?? ""}`}
              actions={<span className="flex items-center gap-2">{open[w.code] ? <Badge tone="warning">{open[w.code]} in progress</Badge> : null}{w.is_default && <Badge tone="info">default</Badge>}
                <InlineAction action={toggleWorkflow} hidden={{ code: w.code, active: String(!w.is_active) }}><SubmitButton variant="ghost" size="sm">{w.is_active ? "Deactivate" : "Activate"}</SubmitButton></InlineAction></span>} />
            <CardBody className="space-y-5">
              {(steps.data ?? []).filter((s) => s.workflow_code === w.code).map((s) => (
                <details key={s.id} className="rounded-md border border-line p-3">
                  <summary className="cursor-pointer text-sm"><span className="font-semibold">{s.step_order}. {s.name}</span> — {s.actor_kind === "supervisor" ? "supervisor / head of office" : s.required_permission} <Badge tone="neutral">→ {s.status_on_approve}</Badge></summary>
                  <div className="mt-3 space-y-3"><StepForm code={w.code} step={s} />
                    <InlineAction action={deleteStep} hidden={{ step_id: s.id }}><SubmitButton variant="ghost" size="sm" confirm="Remove this step?">Remove step</SubmitButton></InlineAction></div>
                </details>
              ))}
              <details><summary className="cursor-pointer text-sm font-medium text-brand-700">Add a step</summary><div className="mt-3"><StepForm code={w.code} /></div></details>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
