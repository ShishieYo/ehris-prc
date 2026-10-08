import type { Row } from "@/lib/db/types";
import type { Lookups } from "@/lib/data/lookups";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { FormGrid, SelectField, TextAreaField, TextField } from "@/components/ui/form";
import { saveHrRequest } from "@/app/(app)/requests/actions";

export function HrRequestForm({ lookups, existing, defaultType }: { lookups: Lookups; existing?: Row<"hr_requests">; defaultType?: string }) {
  const types = lookups.requestTypes.filter((t) => t.is_active);
  const selected = types.find((t) => t.code === (existing?.request_type_code ?? defaultType));
  return (
    <ActionForm action={saveHrRequest}>
      <input type="hidden" name="id" value={existing?.id ?? ""} />
      <FormGrid>
        <SelectField label="What do you need?" name="request_type_code" required defaultValue={selected?.code} placeholder="Select a request type…" options={types.map((t) => ({ value: t.code, label: t.name }))} />
        <SelectField label="Priority" name="priority" defaultValue={existing?.priority ?? "normal"} options={[{ value: "low", label: "Low" }, { value: "normal", label: "Normal" }, { value: "high", label: "High" }, { value: "urgent", label: "Urgent" }]} />
      </FormGrid>
      <TextField label="Subject" name="subject" required maxLength={160} defaultValue={existing?.subject ?? selected?.name ?? ""} hint="A short description, e.g. “COE for visa application”." />
      <TextAreaField label="Details" name="details" defaultValue={existing?.details ?? ""} hint="Purpose, number of copies, and anything else HR should know." />
      <ul className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
        {types.filter((t) => t.requires_attachment).length > 0 && <li>Some request types need a supporting document: attach it on the next page before submitting ({types.filter((t) => t.requires_attachment).map((t) => t.name).join(", ")}).</li>}
      </ul>
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="intent" value="draft" variant="secondary">Save as draft</SubmitButton>
        <SubmitButton name="intent" value="submit">Save and submit</SubmitButton>
      </div>
    </ActionForm>
  );
}
