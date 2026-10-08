import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/lib/auth/session";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, NoAccess, PageHeader } from "@/components/ui/primitives";
import { Table, TBody, Td, THead, Th } from "@/components/ui/table";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { TextField } from "@/components/ui/form";
import { uploadImport } from "./actions";
import { fmtDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Data import" };

export default async function ImportPage() {
  const ctx = await requireCtx();
  if (!ctx.can("import.run")) return <NoAccess />;
  const { data, error } = await ctx.db.from("import_batches").select("*").order("created_at", { ascending: false }).limit(20);
  if (error) throw error;
  return (
    <>
      <PageHeader title="Data import" description="Bring existing spreadsheets into the system safely: upload, map columns, validate, preview, then confirm. Nothing is created until you confirm." />
      <div className="space-y-6">
        <Card>
          <CardHeader title="1. Upload a personnel masterlist" description="CSV or Excel (.xlsx), first sheet, one header row, up to 5,000 rows / 5 MB." />
          <CardBody className="space-y-4">
            <ActionForm action={uploadImport}>
              <TextField label="File" name="file" type="file" accept=".csv,.xlsx" required />
              <SubmitButton pendingText="Reading file…">Upload and continue</SubmitButton>
            </ActionForm>
            <Alert title="Date format">Use YYYY-MM-DD (e.g. 2024-03-15). Slash dates such as 03/05/2024 are rejected because the day and month can&apos;t be told apart.</Alert>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Recent imports" />
          {(data ?? []).length === 0 ? <EmptyState title="No imports yet" /> : (
            <Table caption="Recent imports">
              <THead><Th>File</Th><Th>Date</Th><Th>Rows</Th><Th>Ready</Th><Th>Problems</Th><Th>Imported</Th><Th>Status</Th></THead>
              <TBody>
                {data!.map((b) => (
                  <tr key={b.id}>
                    <Td><Link className="font-medium text-brand-700 underline" href={`/import/${b.id}`}>{b.file_name}</Link></Td>
                    <Td>{fmtDateTime(b.created_at)}</Td><Td>{b.total_rows}</Td><Td>{b.valid_rows}</Td><Td>{b.error_rows}</Td><Td>{b.imported_rows}</Td>
                    <Td><Badge tone={b.status === "committed" ? "success" : b.status === "cancelled" ? "neutral" : "info"}>{b.status}</Badge></Td>
                  </tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
