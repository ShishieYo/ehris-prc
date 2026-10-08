import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/lib/auth/session";
import { getEmployee } from "@/lib/data/employees";
import { getLookups } from "@/lib/data/lookups";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, NoAccess, PageHeader } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { Table, TBody, Td, THead, Th } from "@/components/ui/table";
import { ActionForm, InlineAction, SubmitButton } from "@/components/ui/action-form";
import { FormGrid, SelectField, TextField } from "@/components/ui/form";
import { PrintButton } from "@/components/ui/print-button";
import { deleteServiceRecord, saveServiceRecord } from "../actions";
import { fmtDate, fmtNumber, titleCase } from "@/lib/format";

export const metadata: Metadata = { title: "Service Record" };

export default async function ServiceRecordPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { id } = await params;
  const { edit } = await searchParams;
  const ctx = await requireCtx();
  const isSelf = ctx.employeeId === id;
  if (!isSelf && !ctx.can("service_record.read_all")) return <NoAccess />;

  const [employee, lookups, { data: rows, error }] = await Promise.all([
    getEmployee(ctx, id),
    getLookups(ctx),
    ctx.db.from("service_records").select("*").eq("employee_id", id).order("date_from", { ascending: false }),
  ]);
  if (error) throw error;
  const records = rows ?? [];
  const current = records.find((r) => !r.date_to);
  const canWrite = ctx.can("service_record.write");
  const editing = edit ? records.find((r) => r.id === edit) : undefined;

  // The employee master record should agree with the open-ended service record entry.
  const mismatch =
    current &&
    (current.position_title !== lookups.positionTitle(employee.position_id) ||
      (current.salary_grade ?? null) !== (employee.salary_grade ?? null) ||
      (current.salary_step ?? null) !== (employee.salary_step ?? null));

  return (
    <>
      <PageHeader
        title="Service Record"
        description={`${employee.last_name}, ${employee.first_name} · ${employee.employee_no}`}
        actions={<><PrintButton /><LinkButton href="/requests/new?type=SERVICE_RECORD" variant="secondary">Request certified copy</LinkButton></>}
      />
      <div className="space-y-6">
        {current && (
          <Card>
            <CardHeader title="Current employment record" description="Derived from the open-ended entry in the service record." />
            <CardBody className="flex flex-wrap items-center gap-x-8 gap-y-1 text-sm">
              <span className="text-base font-semibold text-brand-900">{current.position_title}</span>
              <span>{current.appointment_status ?? "—"}</span>
              <span>{current.office ?? "—"}</span>
              <span>since {fmtDate(current.date_from)}</span>
              {current.salary_grade && <span>SG {current.salary_grade}{current.salary_step ? `-${current.salary_step}` : ""}</span>}
            </CardBody>
          </Card>
        )}
        {mismatch && ctx.can("service_record.read_all") && (
          <Alert tone="warning" title="Service record and employee record differ">
            The current service record entry doesn&apos;t match the position or salary grade/step on the employee record. HR should confirm which is correct.
          </Alert>
        )}

        <Card>
          <CardHeader title="History" description="Chronological, newest first. Periods cannot overlap." />
          {records.length === 0 ? <EmptyState title="No service record entries yet" /> : (
            <Table caption="Service record entries">
              <THead>
                <Th>From</Th><Th>To</Th><Th>Position</Th><Th>Status</Th><Th>Office / station</Th><Th>Salary</Th><Th>SG-Step</Th><Th>LWOP</Th><Th>Movement / remarks</Th>
                {canWrite && <Th><span className="sr-only">Actions</span></Th>}
              </THead>
              <TBody>
                {records.map((r) => (
                  <tr key={r.id}>
                    <Td className="whitespace-nowrap">{fmtDate(r.date_from)}</Td>
                    <Td className="whitespace-nowrap">{r.date_to ? fmtDate(r.date_to) : <Badge tone="success">Present</Badge>}</Td>
                    <Td>{r.position_title}</Td>
                    <Td>{r.appointment_status ?? "—"}</Td>
                    <Td>{r.office ?? "—"}{r.station && <div className="text-xs text-slate-500">{r.station}</div>}</Td>
                    <Td>{r.monthly_salary != null ? `₱${fmtNumber(r.monthly_salary)}` : "—"}</Td>
                    <Td>{r.salary_grade ? `${r.salary_grade}${r.salary_step ? `-${r.salary_step}` : ""}` : "—"}</Td>
                    <Td>{r.lwop_days || "—"}</Td>
                    <Td>{titleCase(r.record_type)}{r.separation_cause ? ` — ${r.separation_cause}` : ""}{r.remarks && <div className="text-xs text-slate-500">{r.remarks}</div>}</Td>
                    {canWrite && (
                      <Td className="whitespace-nowrap">
                        <Link className="text-brand-700 underline" href={`/service-record/${id}?edit=${r.id}#form`}>Edit</Link>{" · "}
                        <InlineAction action={deleteServiceRecord} hidden={{ id: r.id, employee_id: id }}><SubmitButton variant="ghost" size="sm" confirm="Delete this entry?">Delete</SubmitButton></InlineAction>
                      </Td>
                    )}
                  </tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        {canWrite && (
          <Card>
            <CardHeader title={editing ? "Edit entry" : "Add an entry"} />
            <CardBody>
              <div id="form" />
              <ActionForm action={saveServiceRecord} key={editing?.id ?? "new"}>
                <input type="hidden" name="employee_id" value={id} />
                <input type="hidden" name="id" value={editing?.id ?? ""} />
                <FormGrid cols={3}>
                  <TextField label="Date from" name="date_from" type="date" required defaultValue={editing?.date_from ?? ""} />
                  <TextField label="Date to" name="date_to" type="date" defaultValue={editing?.date_to ?? ""} hint="Leave blank for the current entry." />
                  <SelectField label="Movement type" name="record_type" defaultValue={editing?.record_type ?? "appointment"} options={["appointment", "promotion", "transfer", "salary_adjustment", "reinstatement", "separation", "other"].map((v) => ({ value: v, label: titleCase(v) }))} />
                  <TextField label="Position" name="position_title" required defaultValue={editing?.position_title ?? ""} />
                  <TextField label="Appointment status" name="appointment_status" defaultValue={editing?.appointment_status ?? ""} />
                  <TextField label="Office" name="office" defaultValue={editing?.office ?? ""} />
                  <TextField label="Station" name="station" defaultValue={editing?.station ?? ""} />
                  <TextField label="Monthly salary" name="monthly_salary" type="number" step="0.01" min={0} defaultValue={editing?.monthly_salary ?? ""} />
                  <TextField label="Salary grade" name="salary_grade" type="number" min={1} max={33} defaultValue={editing?.salary_grade ?? ""} />
                  <TextField label="Step" name="salary_step" type="number" min={1} max={8} defaultValue={editing?.salary_step ?? ""} />
                  <TextField label="Leave without pay (days)" name="lwop_days" type="number" min={0} defaultValue={editing?.lwop_days ?? 0} />
                  <TextField label="Separation cause" name="separation_cause" defaultValue={editing?.separation_cause ?? ""} />
                  <TextField label="Remarks" name="remarks" defaultValue={editing?.remarks ?? ""} />
                </FormGrid>
                <p className="text-xs text-slate-500">Attach supporting documents (appointment papers, etc.) in the employee&apos;s <Link className="underline" href={`/documents?employee=${id}`}>Documents</Link>.</p>
                <div className="flex gap-2">
                  <SubmitButton>{editing ? "Save entry" : "Add entry"}</SubmitButton>
                  {editing && <Link href={`/service-record/${id}`} className="rounded-md border border-slate-300 px-4 py-2 text-sm">Cancel</Link>}
                </div>
              </ActionForm>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
