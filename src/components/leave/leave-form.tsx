import type { Row } from "@/lib/db/types";
import type { Lookups } from "@/lib/data/lookups";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { FormGrid, SelectField, TextAreaField, TextField } from "@/components/ui/form";
import { saveLeave } from "@/app/(app)/leave/actions";

export function LeaveForm({ lookups, existing }: { lookups: Lookups; existing?: Row<"leave_applications"> }) {
  return (
    <ActionForm action={saveLeave}>
      <input type="hidden" name="id" value={existing?.id ?? ""} />
      <FormGrid cols={2}>
        <SelectField label="Leave type" name="leave_type_code" required defaultValue={existing?.leave_type_code} placeholder="Select…"
          options={lookups.leaveTypes.filter((t) => t.is_active).map((t) => ({ value: t.code, label: t.name }))} />
        <TextField label="Number of days" name="days" type="number" step="0.5" min={0.5} defaultValue={existing?.days ?? ""} hint="Leave blank to count working days (Mon–Fri, excluding holidays). Use 0.5 for a half day." />
        <TextField label="From" name="date_from" type="date" required defaultValue={existing?.date_from ?? ""} />
        <TextField label="To" name="date_to" type="date" required defaultValue={existing?.date_to ?? ""} />
      </FormGrid>
      <TextAreaField label="Reason / remarks" name="reason" defaultValue={existing?.reason ?? ""} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="intent" value="draft" variant="secondary">Save as draft</SubmitButton>
        <SubmitButton name="intent" value="submit">Save and submit</SubmitButton>
      </div>
    </ActionForm>
  );
}
