import type { Row } from "@/lib/db/types";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { FormGrid, SelectField, TextAreaField, TextField } from "@/components/ui/form";
import { saveCorrection } from "@/app/(app)/attendance/corrections/actions";
import { isoToManilaLocal, todayManila } from "@/lib/format";

export const CORRECTION_TYPES = [
  { value: "missing_time_in", label: "Missing time in" },
  { value: "missing_time_out", label: "Missing time out" },
  { value: "incorrect_time", label: "Incorrect time recorded" },
  { value: "absent_but_present", label: "Marked absent but was present / on official duty" },
  { value: "other", label: "Other" },
];

export function CorrectionForm({ existing, defaults }: { existing?: Row<"attendance_corrections">; defaults?: { date?: string; type?: string } }) {
  return (
    <ActionForm action={saveCorrection}>
      <input type="hidden" name="id" value={existing?.id ?? ""} />
      <FormGrid>
        <TextField label="Date affected" name="work_date" type="date" required max={todayManila()} defaultValue={existing?.work_date ?? defaults?.date ?? ""} />
        <SelectField label="What needs correcting?" name="correction_type" required defaultValue={existing?.correction_type ?? defaults?.type ?? "missing_time_out"} options={CORRECTION_TYPES} />
        <TextField label="Correct time in" name="proposed_time_in" type="datetime-local" hint="Philippine time. Fill in if time in is affected." defaultValue={existing?.proposed_time_in ? isoToManilaLocal(existing.proposed_time_in) : ""} />
        <TextField label="Correct time out" name="proposed_time_out" type="datetime-local" hint="Philippine time. Fill in if time out is affected." defaultValue={existing?.proposed_time_out ? isoToManilaLocal(existing.proposed_time_out) : ""} />
      </FormGrid>
      <TextAreaField label="Reason" name="reason" required defaultValue={existing?.reason ?? ""} hint="Explain what happened. You can attach supporting documents after saving." />
      <TextAreaField label="Remarks (optional)" name="remarks" defaultValue={existing?.remarks ?? ""} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="intent" value="draft" variant="secondary">Save as draft</SubmitButton>
        <SubmitButton name="intent" value="submit">Save and submit</SubmitButton>
      </div>
    </ActionForm>
  );
}
