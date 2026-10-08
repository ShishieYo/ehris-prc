import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireCtx } from "@/lib/auth/session";
import { isUuid } from "@/lib/data/requests";
import { EMPLOYEE_IMPORT_FIELDS } from "@/lib/import/fields";
import { Alert, Badge, Card, CardBody, CardHeader, NoAccess, PageHeader, Stat } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { Table, TBody, Td, THead, Th } from "@/components/ui/table";
import { ActionForm, InlineAction, SubmitButton } from "@/components/ui/action-form";
import { FormGrid, SelectField } from "@/components/ui/form";
import { cancelImport, confirmImport, mapAndValidate } from "../actions";

export const metadata: Metadata = { title: "Import" };

export default async function ImportBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  if (!ctx.can("import.run")) return <NoAccess />;
  if (!isUuid(id)) notFound();
  const { data: batch } = await ctx.db.from("import_batches").select("*").eq("id", id).maybeSingle();
  if (!batch) notFound();
  const { data: rows } = await ctx.db.from("import_rows").select("*").eq("batch_id", id).order("row_no").limit(5000);
  const all = rows ?? [];
  const headers = Object.keys((all[0]?.raw as Record<string, string>) ?? {});
  const mapping = (batch.mapping ?? {}) as Record<string, string>;
  const errors = all.filter((r) => r.status === "error");
  const valid = all.filter((r) => r.status === "valid");
  const failed = all.filter((r) => r.status === "import_failed");
  const issuesOf = (r: (typeof all)[number]) => (r.errors as { field: string; message: string }[]) ?? [];

  return (
    <>
      <PageHeader title={batch.file_name} description={<>Employee masterlist import · <Badge tone={batch.status === "committed" ? "success" : "info"}>{batch.status}</Badge></>}
        actions={batch.status !== "committed" && batch.status !== "cancelled" && <InlineAction action={cancelImport} hidden={{ batch_id: id }}><SubmitButton variant="secondary" confirm="Cancel this import?">Cancel import</SubmitButton></InlineAction>} />
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Rows in file" value={batch.total_rows} />
          <Stat label="Ready to import" value={batch.status === "uploaded" ? "—" : batch.valid_rows} />
          <Stat label="Rows with problems" value={batch.status === "uploaded" ? "—" : batch.error_rows} tone={batch.error_rows ? "danger" : undefined} />
          <Stat label="Imported" value={batch.imported_rows} />
        </div>

        {(batch.status === "uploaded" || batch.status === "validated") && (
          <Card>
            <CardHeader title="2. Map columns" description="Match your spreadsheet's columns to system fields. We suggested a mapping from the column names. Re-check after changing." />
            <CardBody>
              <ActionForm action={mapAndValidate}>
                <input type="hidden" name="batch_id" value={id} />
                <FormGrid cols={3}>
                  {EMPLOYEE_IMPORT_FIELDS.map((f) => (
                    <SelectField key={f.key} label={f.label} name={`map_${f.key}`} required={f.required} placeholder="— not in file —" defaultValue={mapping[f.key] ?? ""} options={headers.map((h) => ({ value: h, label: h }))} />
                  ))}
                </FormGrid>
                <SubmitButton pendingText="Validating…">{batch.status === "validated" ? "Re-validate" : "Validate rows"}</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
        )}

        {batch.status === "validated" && (
          <>
            <Card>
              <CardHeader title="3. Problems found" description="Rows with problems are never imported. Fix the spreadsheet and upload it again, or confirm to import only the ready rows."
                actions={errors.length > 0 && <LinkButton href={`/import/${id}/errors`} variant="secondary">Download error report (CSV)</LinkButton>} />
              {errors.length === 0 ? <CardBody><Alert tone="success">No problems found.</Alert></CardBody> : (
                <Table caption="Rows with problems">
                  <THead><Th>Row</Th><Th>Name in file</Th><Th>Problems</Th></THead>
                  <TBody>
                    {errors.slice(0, 200).map((r) => {
                      const raw = r.raw as Record<string, string>;
                      return (
                        <tr key={r.id}><Td>{r.row_no}</Td><Td>{[raw[mapping.last_name], raw[mapping.first_name]].filter(Boolean).join(", ")}</Td>
                          <Td><ul className="list-disc pl-4">{issuesOf(r).map((i, k) => <li key={k}><span className="font-medium">{EMPLOYEE_IMPORT_FIELDS.find((f) => f.key === i.field)?.label ?? i.field}:</span> {i.message}</li>)}</ul></Td></tr>
                      );
                    })}
                  </TBody>
                </Table>
              )}
              {errors.length > 200 && <p className="px-4 py-3 text-xs text-slate-500">Showing 200 of {errors.length}. Download the report for all.</p>}
            </Card>

            <Card>
              <CardHeader title="4. Preview" description={`First ${Math.min(10, valid.length)} of ${valid.length} ready rows.`} />
              {valid.length === 0 ? <CardBody><p className="text-sm text-slate-500">No rows are ready to import.</p></CardBody> : (
                <Table caption="Preview of rows to be imported">
                  <THead><Th>Row</Th><Th>Name</Th><Th>Position</Th><Th>Status</Th></THead>
                  <TBody>
                    {valid.slice(0, 10).map((r) => {
                      const raw = r.raw as Record<string, string>;
                      return <tr key={r.id}><Td>{r.row_no}</Td><Td>{[raw[mapping.last_name], raw[mapping.first_name]].filter(Boolean).join(", ")}</Td><Td>{raw[mapping.position] ?? ""}</Td><Td>{raw[mapping.employment_status] ?? ""}</Td></tr>;
                    })}
                  </TBody>
                </Table>
              )}
            </Card>

            <Card className="border-brand-300">
              <CardHeader title="5. Confirm import" />
              <CardBody>
                <ActionForm action={confirmImport}>
                  <input type="hidden" name="batch_id" value={id} />
                  <p className="text-sm text-slate-700">This creates <strong>{valid.length}</strong> employee record(s). {errors.length > 0 && <>The {errors.length} row(s) with problems will be skipped and stay in the error report. </>}The import is logged in the audit trail.</p>
                  <SubmitButton confirm={`Create ${valid.length} employee records?`} pendingText="Importing…">Import {valid.length} record(s)</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          </>
        )}

        {batch.status === "committed" && (
          <Card>
            <CardHeader title="Result" actions={<Link className="text-sm text-brand-700 underline" href="/personnel">Open Personnel Records</Link>} />
            <CardBody className="space-y-3">
              <Alert tone="success">Imported {batch.imported_rows} record(s) on {batch.committed_at?.slice(0, 10)}.</Alert>
              {failed.length > 0 && (
                <Alert tone="danger" title={`${failed.length} row(s) were rejected by the database`}>
                  <ul className="list-disc pl-4">{failed.map((r) => <li key={r.id}>Row {r.row_no}: {r.result}</li>)}</ul>
                </Alert>
              )}
              {errors.length > 0 && <LinkButton href={`/import/${id}/errors`} variant="secondary">Download error report (CSV)</LinkButton>}
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
