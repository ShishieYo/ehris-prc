import type { Lookups } from "@/lib/data/lookups";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { FormGrid, SelectField, TextField, TextAreaField } from "@/components/ui/form";
import { uploadDocument } from "@/app/(app)/documents/actions";

/** Upload a new personnel document (optionally attached to a request). */
export function UploadForm({ employeeId, lookups, categoryCodes, related, returnTo, compact }: {
  employeeId: string; lookups: Lookups; categoryCodes?: string[]; related?: { type: string; id: string }; returnTo?: string; compact?: boolean;
}) {
  const categories = lookups.documentCategories.filter((c) => c.is_active && (!categoryCodes || categoryCodes.includes(c.code)));
  return (
    <ActionForm action={uploadDocument} className="space-y-4">
      <input type="hidden" name="employee_id" value={employeeId} />
      <input type="hidden" name="related_type" value={related?.type ?? ""} />
      <input type="hidden" name="related_id" value={related?.id ?? ""} />
      <input type="hidden" name="return_to" value={returnTo ?? ""} />
      <FormGrid cols={compact ? 2 : 3}>
        <SelectField label="Category" name="category_code" required options={categories.map((c) => ({ value: c.code, label: `${c.group_name} — ${c.name}` }))} defaultValue={categoryCodes?.[0]} />
        <TextField label="Title" name="title" required maxLength={160} />
        <TextField label="Document date" name="doc_date" type="date" />
        {!compact && <TextField label="Issuing agency" name="issuing_agency" />}
        {!compact && <TextField label="Expires on" name="expires_on" type="date" hint="Only if the document expires." />}
        <TextField label="File (PDF, JPG or PNG)" name="file" type="file" accept="application/pdf,image/jpeg,image/png" required />
      </FormGrid>
      {!compact && <TextAreaField label="Remarks" name="remarks" />}
      <SubmitButton pendingText="Uploading…">Upload document</SubmitButton>
    </ActionForm>
  );
}
