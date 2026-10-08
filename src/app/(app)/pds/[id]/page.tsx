import type { Metadata } from "next";
import { requireCtx } from "@/lib/auth/session";
import { getEmployee, getEmployeePrivate } from "@/lib/data/employees";
import { getPds, pdsState } from "@/lib/data/pds";
import { PDS_SECTIONS } from "@/lib/pds/sections";
import { logEvent } from "@/lib/audit";
import { Alert, Badge, Card, CardBody, CardHeader, DefList, NoAccess, PageHeader } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { CheckboxField, SelectField, TextField } from "@/components/ui/form";
import { PdsSectionCard } from "@/components/pds/section-card";
import { DeclarationCard } from "@/components/pds/declaration";
import { PrintButton } from "@/components/ui/print-button";
import { certifyPds, reviewPds } from "../actions";
import { fmtDate, fmtDateTime, titleCase } from "@/lib/format";

export const metadata: Metadata = { title: "Personal Data Sheet" };

export default async function PdsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { id } = await params;
  const { edit } = await searchParams;
  const ctx = await requireCtx();
  const isSelf = ctx.employeeId === id;
  if (!isSelf && !ctx.can("pds.read_all")) return <NoAccess />;

  const employee = await getEmployee(ctx, id);
  const [priv, pds] = await Promise.all([getEmployeePrivate(ctx, id), getPds(ctx, id)]);
  if (!isSelf) await logEvent(ctx, "pds.viewed", "pds", { entityType: "employees", entityId: id, subjectEmployeeId: id });

  const canEdit = isSelf || ctx.can("pds.write_any");
  const state = pdsState(pds.submissions);
  const [editSection, editId] = (edit ?? "").split(":");
  const name = [employee.first_name, employee.middle_name, employee.last_name, employee.extension_name].filter(Boolean).join(" ");
  const latest = pds.submissions[0];

  return (
    <>
      <PageHeader
        title={isSelf ? "My Personal Data Sheet" : `PDS — ${name}`}
        description={<><Badge tone={state.tone}>{state.label}</Badge> <span className="ml-1">Structured electronic PDS. Sections are stored as separate records, not one document.</span></>}
        actions={<><PrintButton /><LinkButton href={`/pds/${id}/pdf`} variant="secondary">Generate PDF</LinkButton></>}
      />
      <div className="space-y-6">
        {latest?.kind === "returned" && <Alert tone="warning" title="HR returned this PDS for correction">{latest.remarks}</Alert>}

        <Card>
          <CardHeader title="1. Personal information" description={isSelf ? "Edit contact details and addresses in My Profile. Name or civil-status changes go through an HR request." : undefined} />
          <CardBody>
            <DefList items={[
              ["Name", name], ["Employee ID", employee.employee_no],
              ["Date of birth", priv ? fmtDate(priv.birth_date) : "Restricted"], ["Place of birth", priv?.birth_place ?? (priv ? null : "Restricted")],
              ["Sex", employee.sex ? titleCase(employee.sex) : null], ["Civil status", priv?.civil_status ? titleCase(priv.civil_status) : null],
              ["Citizenship", priv?.citizenship], ["Mobile", priv?.mobile_no], ["Personal email", priv?.personal_email],
            ]} />
          </CardBody>
        </Card>

        {PDS_SECTIONS.map((def, i) => (
          <PdsSectionCard key={def.key} def={def} number={i + 2} rows={pds.sections[def.key]} employeeId={id} canEdit={canEdit}
            editingId={editSection === def.key ? editId : null} />
        ))}

        <DeclarationCard number={PDS_SECTIONS.length + 2} employeeId={id} questions={pds.questions} answers={pds.answers} canEdit={canEdit} />

        <Card>
          <CardHeader title={`${PDS_SECTIONS.length + 3}. Certification`} />
          <CardBody className="space-y-4">
            <p className="text-sm text-slate-700">I declare under oath that I have personally accomplished this Personal Data Sheet and that the information is true, correct and complete to the best of my knowledge.</p>
            {isSelf && (
              <ActionForm action={certifyPds}>
                <CheckboxField name="confirm" label="I certify that the information in my PDS is true, correct and complete." />
                <SubmitButton>Certify my PDS</SubmitButton>
              </ActionForm>
            )}
            {ctx.can("pds.verify") && !isSelf && (
              <ActionForm action={reviewPds}>
                <input type="hidden" name="employee_id" value={id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField label="HR review outcome" name="kind" defaultValue="verified" options={[{ value: "verified", label: "Verified" }, { value: "returned", label: "Return for correction (remarks required)" }]} />
                  <TextField label="Remarks" name="remarks" />
                </div>
                <SubmitButton>Record review</SubmitButton>
              </ActionForm>
            )}
            {pds.submissions.length > 0 && (
              <ul className="divide-y divide-line text-sm">
                {pds.submissions.map((s) => (
                  <li key={s.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                    <span><strong>{titleCase(s.kind)}</strong> by {s.by_name}{s.remarks ? ` — ${s.remarks}` : ""}</span>
                    <span className="text-slate-500">{fmtDateTime(s.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-slate-500">The signed paper copy and official CSC Form 212 remain the legal record; this electronic PDS supports encoding and HR verification.</p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
