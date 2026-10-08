import Link from "next/link";
import type { FieldDef, SectionDef } from "@/lib/pds/sections";
import { ActionForm, InlineAction, SubmitButton } from "@/components/ui/action-form";
import { FormGrid, SelectField, TextAreaField, TextField } from "@/components/ui/form";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/primitives";
import { Table, TBody, Td, THead, Th } from "@/components/ui/table";
import { deletePdsRow, savePdsRow } from "@/app/(app)/pds/actions";
import { fmtDate, fmtNumber } from "@/lib/format";

function cell(f: FieldDef, value: unknown): string {
  if (value == null || value === "") return "—";
  if (f.type === "date") return fmtDate(String(value));
  if (f.type === "number") return fmtNumber(Number(value));
  if (f.type === "select") return f.options?.find((o) => o.value === value)?.label ?? String(value);
  return String(value);
}

function Field({ f, value }: { f: FieldDef; value: unknown }) {
  const dv = value == null ? "" : String(value);
  if (f.type === "select") return <SelectField label={f.label} name={f.name} required={f.required} options={f.options ?? []} defaultValue={dv || undefined} placeholder={dv ? undefined : "Select…"} />;
  if (f.type === "textarea") return <TextAreaField label={f.label} name={f.name} required={f.required} defaultValue={dv} />;
  const type = f.type === "date" ? "date" : f.type === "year" ? "number" : f.type === "number" ? "number" : "text";
  return <TextField label={f.label} name={f.name} type={type} required={f.required} hint={f.hint} defaultValue={dv} step={f.type === "number" ? "any" : undefined} min={f.type === "year" ? 1900 : undefined} max={f.type === "year" ? 2100 : undefined} />;
}

export function PdsSectionCard({ def, rows, employeeId, canEdit, editingId, number }: {
  def: SectionDef; rows: Record<string, unknown>[]; employeeId: string; canEdit: boolean; editingId?: string | null; number: number;
}) {
  const listFields = def.fields.filter((f) => f.list);
  const editing = editingId && editingId !== "new" ? rows.find((r) => r.id === editingId) : undefined;
  const full = def.maxRows !== undefined && rows.length >= def.maxRows;
  const formOpen = !!editingId;
  return (
    <Card>
      <CardHeader title={`${number}. ${def.title}`} description={def.description} />
      {rows.length === 0 ? <EmptyState title="No entries yet" /> : (
        <Table caption={def.title}>
          <THead>{listFields.map((f) => <Th key={f.name}>{f.label}</Th>)}{canEdit && <Th><span className="sr-only">Actions</span></Th>}</THead>
          <TBody>
            {rows.map((r) => (
              <tr key={String(r.id)}>
                {listFields.map((f) => <Td key={f.name}>{cell(f, r[f.name])}</Td>)}
                {canEdit && (
                  <Td className="whitespace-nowrap">
                    <Link className="text-brand-700 underline" href={`/pds/${employeeId}?edit=${def.key}:${r.id}#sec-${def.key}`}>Edit</Link>{" · "}
                    <InlineAction action={deletePdsRow} hidden={{ section: def.key, id: String(r.id), employee_id: employeeId }}>
                      <SubmitButton variant="ghost" size="sm" confirm="Remove this entry?">Remove</SubmitButton>
                    </InlineAction>
                  </Td>
                )}
              </tr>
            ))}
          </TBody>
        </Table>
      )}
      {canEdit && (
        <CardBody className="border-t border-line" >
          {full && !editing ? <p className="text-sm text-slate-500">Maximum of {def.maxRows} entries reached.</p> : (
            <details open={formOpen} id={`sec-${def.key}`}>
              <summary className="cursor-pointer text-sm font-medium text-brand-700">{editing ? "Edit entry" : "Add an entry"}</summary>
              <div className="mt-3">
                <ActionForm action={savePdsRow} key={String(editing?.id ?? "new")}>
                  <input type="hidden" name="section" value={def.key} />
                  <input type="hidden" name="employee_id" value={employeeId} />
                  <input type="hidden" name="id" value={String(editing?.id ?? "")} />
                  <FormGrid cols={3}>{def.fields.map((f) => <Field key={f.name} f={f} value={editing?.[f.name]} />)}</FormGrid>
                  <div className="flex gap-2">
                    <SubmitButton>{editing ? "Save entry" : "Add entry"}</SubmitButton>
                    {editing && <Link className="rounded-md border border-slate-300 px-4 py-2 text-sm" href={`/pds/${employeeId}`}>Cancel</Link>}
                  </div>
                </ActionForm>
              </div>
            </details>
          )}
        </CardBody>
      )}
    </Card>
  );
}
