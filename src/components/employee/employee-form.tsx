import type { Row } from "@/lib/db/types";
import type { Ctx } from "@/lib/auth/session";
import type { Lookups } from "@/lib/data/lookups";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { FormGrid, SelectField, TextAreaField, TextField } from "@/components/ui/form";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { saveEmployee } from "@/app/(app)/personnel/actions";

const v = (x: string | number | null | undefined) => (x == null ? "" : String(x));

export function EmployeeForm({ ctx, lookups, employee, priv, supervisors }: {
  ctx: Ctx; lookups: Lookups; employee?: Row<"employees">; priv?: Row<"employee_private"> | null;
  supervisors: { id: string; employee_no: string; full_name: string }[];
}) {
  const editing = !!employee;
  const manage = ctx.can("employee.manage_status");
  const sensitive = ctx.can("employee.read_sensitive");
  return (
    <ActionForm action={saveEmployee} className="space-y-6">
      <input type="hidden" name="id" value={employee?.id ?? ""} />
      <Card>
        <CardHeader title="Identity" />
        <CardBody>
          <FormGrid cols={3}>
            {!editing && <TextField label="Employee ID" name="employee_no" hint="Leave blank to generate automatically." />}
            <TextField label="PRC employee number" name="prc_employee_no" defaultValue={v(employee?.prc_employee_no)} />
            <TextField label="First name" name="first_name" required defaultValue={v(employee?.first_name)} />
            <TextField label="Middle name" name="middle_name" defaultValue={v(employee?.middle_name)} />
            <TextField label="Last name" name="last_name" required defaultValue={v(employee?.last_name)} />
            <TextField label="Extension name" name="extension_name" hint="Jr., Sr., III…" defaultValue={v(employee?.extension_name)} />
            <SelectField label="Sex" name="sex" placeholder="—" defaultValue={v(employee?.sex)} options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }]} />
            <TextField label="Official email" name="official_email" type="email" defaultValue={v(employee?.official_email)} />
          </FormGrid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Government employment information" />
        <CardBody>
          <FormGrid cols={3}>
            <SelectField label="Position" name="position_id" placeholder="—" defaultValue={v(employee?.position_id)} options={lookups.positions.filter((p) => p.is_active).map((p) => ({ value: p.id, label: p.title }))} />
            <SelectField label="Plantilla item" name="plantilla_item_id" placeholder="—" defaultValue={v(employee?.plantilla_item_id)} options={lookups.plantilla.filter((p) => p.is_active).map((p) => ({ value: p.id, label: `${p.item_number} — ${lookups.positionTitle(p.position_id)}` }))} />
            <TextField label="Position number" name="position_number" defaultValue={v(employee?.position_number)} />
            <TextField label="Salary grade" name="salary_grade" type="number" min={1} max={33} defaultValue={v(employee?.salary_grade)} />
            <TextField label="Step" name="salary_step" type="number" min={1} max={8} defaultValue={v(employee?.salary_step)} />
            <SelectField label="Nature of appointment" name="appointment_nature_code" placeholder="—" defaultValue={v(employee?.appointment_nature_code)} options={lookups.appointmentNatures.filter((n) => n.is_active).map((n) => ({ value: n.code, label: n.name }))} />
            <TextField label="Original appointment date" name="original_appointment_date" type="date" defaultValue={v(employee?.original_appointment_date)} />
            <TextField label="Current appointment date" name="current_appointment_date" type="date" defaultValue={v(employee?.current_appointment_date)} />
            <TextField label="Date assumed" name="date_assumed" type="date" defaultValue={v(employee?.date_assumed)} />
            <SelectField label="Office / division / section / unit" name="org_unit_id" placeholder="—" defaultValue={v(employee?.org_unit_id)} options={lookups.orgUnits.filter((u) => u.is_active).map((u) => ({ value: u.id, label: lookups.orgUnitPath(u.id) }))} />
            <SelectField label="Immediate supervisor" name="supervisor_employee_id" placeholder="—" defaultValue={v(employee?.supervisor_employee_id)} options={supervisors.filter((s) => s.id !== employee?.id).map((s) => ({ value: s.id, label: `${s.full_name} (${s.employee_no})` }))} />
            {manage && (
              <>
                <SelectField label="Employment status" name="employment_status_code" placeholder="—" defaultValue={v(employee?.employment_status_code)} options={lookups.employmentStatuses.filter((s) => s.is_active || s.code === employee?.employment_status_code).map((s) => ({ value: s.code, label: s.name }))} />
                <SelectField label="Record status" name="record_status" defaultValue={v(employee?.record_status ?? "active")} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "separated", label: "Separated" }]} />
                <TextField label="Separation date" name="separation_date" type="date" defaultValue={v(employee?.separation_date)} />
              </>
            )}
          </FormGrid>
          {!manage && <p className="mt-3 text-xs text-slate-500">Employment status and record status can be changed by HR administrators only.</p>}
        </CardBody>
      </Card>

      {sensitive && (
        <Card>
          <CardHeader title="Personal and government identifiers" description="Restricted information. Changes are recorded without revealing the values." />
          <CardBody>
            <FormGrid cols={3}>
              <TextField label="Date of birth" name="birth_date" type="date" defaultValue={v(priv?.birth_date)} />
              <TextField label="Place of birth" name="birth_place" defaultValue={v(priv?.birth_place)} />
              <SelectField label="Civil status" name="civil_status" placeholder="—" defaultValue={v(priv?.civil_status)} options={["single", "married", "widowed", "separated", "annulled", "other"].map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1) }))} />
              <TextField label="Citizenship" name="citizenship" defaultValue={v(priv?.citizenship)} />
              <SelectField label="Blood type" name="blood_type" placeholder="—" defaultValue={v(priv?.blood_type)} options={["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((c) => ({ value: c, label: c }))} />
              <TextField label="TIN" name="tin" inputMode="numeric" defaultValue={v(priv?.tin)} />
              <TextField label="GSIS BP number" name="gsis_bp_no" inputMode="numeric" defaultValue={v(priv?.gsis_bp_no)} />
              <TextField label="PhilHealth number" name="philhealth_no" inputMode="numeric" defaultValue={v(priv?.philhealth_no)} />
              <TextField label="Pag-IBIG number" name="pagibig_no" inputMode="numeric" defaultValue={v(priv?.pagibig_no)} />
              <TextField label="Personal email" name="personal_email" type="email" defaultValue={v(priv?.personal_email)} />
              <TextField label="Mobile number" name="mobile_no" type="tel" defaultValue={v(priv?.mobile_no)} />
            </FormGrid>
          </CardBody>
        </Card>
      )}

      {editing && (
        <Card>
          <CardHeader title="Reason for change" description="Required. Shown in the employee's change history." />
          <CardBody><TextAreaField label="Reason" name="reason" required hint="e.g. Promotion, correction of encoding error, reassignment" /></CardBody>
        </Card>
      )}
      <SubmitButton pendingText="Saving…">{editing ? "Save changes" : "Create employee record"}</SubmitButton>
    </ActionForm>
  );
}
