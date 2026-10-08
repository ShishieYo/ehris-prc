import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/auth/session";
import { adminTableByKey, type AdminField } from "@/lib/admin/tables";
import { resolveOptions } from "@/lib/data/admin";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, NoAccess, PageHeader } from "@/components/ui/primitives";
import { Table, TBody, Td, THead, Th } from "@/components/ui/table";
import { ActionForm, InlineAction, SubmitButton } from "@/components/ui/action-form";
import { CheckboxField, FormGrid, SelectField, TextAreaField, TextField } from "@/components/ui/form";
import { deleteAdminRow, saveAdminRow } from "../../actions";

export const metadata: Metadata = { title: "Configuration" };

const show = (f: AdminField, v: unknown, options: Record<string, { value: string; label: string }[]>) => {
  if (v == null || v === "") return "—";
  if (f.type === "checkbox") return v ? <Badge tone="success">Yes</Badge> : <Badge tone="neutral">No</Badge>;
  if (f.type === "select") return options[f.name]?.find((o) => o.value === v)?.label ?? String(v);
  return String(v);
};

export default async function AdminTablePage({ params, searchParams }: { params: Promise<{ table: string }>; searchParams: Promise<{ edit?: string; notice?: string }> }) {
  const { table } = await params;
  const { edit, notice } = await searchParams;
  const def = adminTableByKey(table);
  if (!def) notFound();
  const ctx = await requireCtx();
  const canWrite = ctx.can(def.permission);
  if (!canWrite && !ctx.canAny("admin.config", "org.manage")) return <NoAccess />;

  const query = ctx.db.from(def.table).select("*") as unknown as { order: (c: string) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }> };
  const [{ data, error }, options] = await Promise.all([query.order(def.orderBy), resolveOptions(ctx, def.fields)]);
  if (error) throw error;
  const rows = data ?? [];
  const editing = edit ? rows.find((r) => String(r[def.pk]) === edit) : undefined;
  const listFields = def.fields.filter((f) => f.list);

  return (
    <>
      <PageHeader title={def.title} description={def.description} actions={<Link href="/admin" className="text-sm text-brand-700 underline">All configuration</Link>} />
      <div className="space-y-6">
        {notice && <Alert tone="warning">{notice}</Alert>}
        <Card>
          {rows.length === 0 ? <EmptyState title="Nothing configured yet" /> : (
            <Table caption={def.title}>
              <THead>{listFields.map((f) => <Th key={f.name}>{f.label}</Th>)}{canWrite && <Th><span className="sr-only">Actions</span></Th>}</THead>
              <TBody>
                {rows.map((r) => (
                  <tr key={String(r[def.pk])}>
                    {listFields.map((f) => <Td key={f.name}>{show(f, r[f.name], options)}</Td>)}
                    {canWrite && (
                      <Td className="whitespace-nowrap">
                        <Link className="text-brand-700 underline" href={`/admin/t/${def.key}?edit=${encodeURIComponent(String(r[def.pk]))}#form`}>Edit</Link>{" · "}
                        <InlineAction action={deleteAdminRow} hidden={{ table: def.key, pk_value: String(r[def.pk]) }}><SubmitButton variant="ghost" size="sm" confirm="Delete this item? Items in use can't be deleted.">Delete</SubmitButton></InlineAction>
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
            <CardHeader title={editing ? "Edit" : "Add"} />
            <CardBody>
              <div id="form" />
              <ActionForm action={saveAdminRow} key={String(editing?.[def.pk] ?? "new")}>
                <input type="hidden" name="table" value={def.key} />
                <input type="hidden" name="pk_value" value={editing ? String(editing[def.pk]) : ""} />
                <FormGrid cols={3}>
                  {def.fields.map((f) => {
                    const v = editing?.[f.name];
                    if (f.type === "checkbox") return <CheckboxField key={f.name} name={f.name} label={f.label} defaultChecked={editing ? !!v : f.name === "is_active"} />;
                    if (f.type === "select") return <SelectField key={f.name} name={f.name} label={f.label} required={f.required} hint={f.hint} placeholder={f.required ? undefined : "—"} options={options[f.name] ?? []} defaultValue={v == null ? undefined : String(v)} disabled={!!editing && f.immutable} />;
                    if (f.type === "textarea") return <TextAreaField key={f.name} name={f.name} label={f.label} required={f.required} defaultValue={v == null ? "" : String(v)} />;
                    return <TextField key={f.name} name={f.name} label={f.label} required={f.required} hint={f.hint} type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} defaultValue={v == null ? "" : String(v)} disabled={!!editing && f.immutable} />;
                  })}
                </FormGrid>
                <div className="flex gap-2">
                  <SubmitButton>{editing ? "Save changes" : "Add"}</SubmitButton>
                  {editing && <Link href={`/admin/t/${def.key}`} className="rounded-md border border-slate-300 px-4 py-2 text-sm">Cancel</Link>}
                </div>
              </ActionForm>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
