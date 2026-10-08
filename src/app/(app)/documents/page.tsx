import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/lib/auth/session";
import { getLookups } from "@/lib/data/lookups";
import { listDocuments } from "@/lib/data/documents";
import { getDirectoryEntry } from "@/lib/data/employees";
import { Alert, Card, CardHeader, EmptyState, NoAccess, PageHeader } from "@/components/ui/primitives";
import { DocumentStatusBadge } from "@/components/ui/status";
import { Table, TBody, Td, THead, Th } from "@/components/ui/table";
import { UploadForm } from "@/components/documents/upload-form";
import { fmtDate } from "@/lib/format";

export const metadata: Metadata = { title: "Documents" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ employee?: string; category?: string }> }) {
  const ctx = await requireCtx();
  const { employee, category } = await searchParams;
  const employeeId = employee ?? ctx.employeeId;
  const isSelf = employeeId === ctx.employeeId;
  if (!employeeId) {
    return <><PageHeader title="Documents" /><Alert>Open an employee from <Link className="underline" href="/personnel">Personnel Records</Link> to see their documents.</Alert></>;
  }
  if (!isSelf && !ctx.can("document.read_all")) return <NoAccess />;

  const [lookups, docs, person] = await Promise.all([getLookups(ctx), listDocuments(ctx, employeeId, category), getDirectoryEntry(ctx, employeeId)]);
  const catName = (code: string) => lookups.documentCategories.find((c) => c.code === code)?.name ?? code;
  const canUpload = isSelf || ctx.can("document.write");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title={isSelf ? "My Documents" : `Documents — ${person?.full_name ?? ""}`}
        description="Your digital personnel folder. Files are stored privately; every view and download is logged."
      />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Folder" actions={
            <form className="flex flex-wrap items-center gap-2 text-sm">
              {employee && <input type="hidden" name="employee" value={employee} />}
              <label htmlFor="cat" className="sr-only">Category</label>
              <select id="cat" name="category" defaultValue={category ?? ""} className="rounded-md border border-slate-300 px-2 py-1">
                <option value="">All categories</option>
                {lookups.documentCategories.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
              <button className="rounded-md border border-slate-300 px-2 py-1">Filter</button>
            </form>
          } />
          {docs.length === 0 ? <EmptyState title="No documents yet">Upload your appointment papers, IDs, certificates and other records below.</EmptyState> : (
            <Table caption="Personnel documents">
              <THead><Th>Document</Th><Th>Category</Th><Th>Date</Th><Th>Issued by</Th><Th>Version</Th><Th>Status</Th></THead>
              <TBody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <Td>
                      <Link href={`/documents/${d.id}`} className="font-medium text-brand-700 underline">{d.title}</Link>
                      <div className="text-xs text-slate-500">{d.doc_no}</div>
                    </Td>
                    <Td>{catName(d.category_code)}</Td>
                    <Td>{fmtDate(d.doc_date)}{d.expires_on && <div className={`text-xs ${d.expires_on < today ? "font-semibold text-red-700" : "text-slate-500"}`}>Expires {fmtDate(d.expires_on)}</div>}</Td>
                    <Td>{d.issuing_agency ?? "—"}</Td>
                    <Td>v{d.current_version_no}</Td>
                    <Td><DocumentStatusBadge status={d.status} deleted={!!d.deleted_at} /></Td>
                  </tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
        {canUpload && (
          <Card>
            <CardHeader title="Upload a document" description="PDF, JPG or PNG. Maximum size is set by your administrator." />
            <div className="p-4"><UploadForm employeeId={employeeId} lookups={lookups} categoryCodes={lookups.documentCategories.filter((c) => c.code !== "SUPPORTING").map((c) => c.code)} /></div>
          </Card>
        )}
      </div>
    </>
  );
}
