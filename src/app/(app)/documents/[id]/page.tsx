import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/lib/auth/session";
import { getLookups } from "@/lib/data/lookups";
import { getDocument } from "@/lib/data/documents";
import { Alert, Card, CardBody, CardHeader, DefList, PageHeader } from "@/components/ui/primitives";
import { DocumentStatusBadge } from "@/components/ui/status";
import { LinkButton } from "@/components/ui/button";
import { Table, TBody, Td, THead, Th } from "@/components/ui/table";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { FormGrid, SelectField, TextAreaField, TextField } from "@/components/ui/form";
import { deleteDocument, replaceDocument, reviewDocument, updateDocumentDetails } from "../actions";
import { fmtBytes } from "@/lib/documents/upload";
import { fmtDate, fmtDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Document" };

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  const [{ doc, versions }, lookups] = await Promise.all([getDocument(ctx, id), getLookups(ctx)]);
  const isSelf = ctx.employeeId === doc.employee_id;
  const hr = ctx.can("document.write");
  const deleted = !!doc.deleted_at;
  const canEdit = !deleted && (hr || (isSelf && doc.status !== "verified"));
  const canReplace = !deleted && (hr || isSelf);

  return (
    <>
      <PageHeader
        title={doc.title}
        description={<>{doc.doc_no} · <DocumentStatusBadge status={doc.status} deleted={deleted} /></>}
        actions={!deleted && <>
          <LinkButton href={`/documents/${id}/file`} target="_blank" variant="secondary">View</LinkButton>
          <LinkButton href={`/documents/${id}/file?download=1`} variant="secondary">Download</LinkButton>
        </>}
      />
      <div className="space-y-6">
        {deleted && <Alert tone="danger" title="This document was deleted">Reason: {doc.deleted_reason}. Versions are retained for records management.</Alert>}
        <Card>
          <CardHeader title="Details" actions={<Link className="text-sm text-brand-700 underline" href={isSelf ? "/documents" : `/documents?employee=${doc.employee_id}`}>Back to folder</Link>} />
          <CardBody>
            <DefList items={[
              ["Category", lookups.documentCategories.find((c) => c.code === doc.category_code)?.name ?? doc.category_code],
              ["Document date", fmtDate(doc.doc_date)], ["Issuing agency", doc.issuing_agency],
              ["Expires on", doc.expires_on ? fmtDate(doc.expires_on) : null], ["Current version", `v${doc.current_version_no}`],
              ["Added", fmtDateTime(doc.created_at)], ["Remarks", doc.remarks],
            ]} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Version history" description="Replacing a file never overwrites the old one." />
          <Table caption="Document versions">
            <THead><Th>Version</Th><Th>File</Th><Th>Uploaded</Th><Th>Reason</Th><Th>Checksum</Th><Th><span className="sr-only">Open</span></Th></THead>
            <TBody>
              {versions.map((v) => (
                <tr key={v.id}>
                  <Td>v{v.version_no}{v.version_no === doc.current_version_no && <span className="ml-1 text-xs text-emerald-700">(current)</span>}</Td>
                  <Td>{v.file_name}<div className="text-xs text-slate-500">{fmtBytes(v.size_bytes)} · {v.mime_type}</div></Td>
                  <Td>{fmtDateTime(v.uploaded_at)}<div className="text-xs text-slate-500">{v.uploaded_by_name}</div></Td>
                  <Td>{v.change_reason ?? "—"}</Td>
                  <Td className="font-mono text-xs">{v.sha256.slice(0, 12)}…</Td>
                  <Td className="whitespace-nowrap">
                    {!deleted && <><Link className="text-brand-700 underline" target="_blank" href={`/documents/${id}/file?v=${v.version_no}`}>View</Link>{" · "}<Link className="text-brand-700 underline" href={`/documents/${id}/file?v=${v.version_no}&download=1`}>Download</Link></>}
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        </Card>

        {canReplace && (
          <Card>
            <CardHeader title="Upload a new version" />
            <CardBody>
              <ActionForm action={replaceDocument}>
                <input type="hidden" name="document_id" value={id} />
                <input type="hidden" name="employee_id" value={doc.employee_id} />
                <FormGrid>
                  <TextField label="New file (PDF, JPG or PNG)" name="file" type="file" accept="application/pdf,image/jpeg,image/png" required />
                  <TextField label="Reason for replacing" name="reason" required hint="e.g. clearer scan, renewed ID" />
                </FormGrid>
                <SubmitButton pendingText="Uploading…">Upload new version</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
        )}

        {canEdit && (
          <Card>
            <CardHeader title="Edit details" />
            <CardBody>
              <ActionForm action={updateDocumentDetails}>
                <input type="hidden" name="document_id" value={id} />
                <FormGrid cols={3}>
                  <TextField label="Title" name="title" required defaultValue={doc.title} />
                  <TextField label="Document date" name="doc_date" type="date" defaultValue={doc.doc_date ?? ""} />
                  <TextField label="Issuing agency" name="issuing_agency" defaultValue={doc.issuing_agency ?? ""} />
                  <TextField label="Expires on" name="expires_on" type="date" defaultValue={doc.expires_on ?? ""} />
                </FormGrid>
                <TextAreaField label="Remarks" name="remarks" defaultValue={doc.remarks ?? ""} />
                <SubmitButton>Save details</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
        )}

        {!deleted && ctx.can("document.verify") && (
          <Card>
            <CardHeader title="HR review" />
            <CardBody>
              <ActionForm action={reviewDocument}>
                <input type="hidden" name="document_id" value={id} />
                <FormGrid>
                  <SelectField label="Outcome" name="status" defaultValue="verified" options={[{ value: "verified", label: "Verified" }, { value: "rejected", label: "Rejected (remarks required)" }, { value: "for_review", label: "Back to review" }, { value: "archived", label: "Archived" }]} />
                  <TextField label="Remarks" name="remarks" />
                </FormGrid>
                <SubmitButton>Record outcome</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
        )}

        {!deleted && ctx.can("document.delete") && (
          <Card>
            <CardHeader title="Delete document" description="The document is hidden from the employee. File versions and the audit trail are retained." />
            <CardBody>
              <ActionForm action={deleteDocument}>
                <input type="hidden" name="document_id" value={id} />
                <TextField label="Reason" name="reason" required />
                <SubmitButton variant="danger" confirm="Delete this document?">Delete document</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
