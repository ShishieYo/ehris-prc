"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActionCtx } from "@/lib/auth/session";
import { storeUpload } from "@/lib/data/documents";
import { UploadError } from "@/lib/documents/upload";
import { formObject, optDate, optText, reqText } from "@/lib/validation/common";
import { safeNext } from "@/lib/auth/safe-redirect";
import { fail, fieldErrorsFrom, type ActionState } from "@/lib/errors";

const detailsSchema = z.object({
  title: reqText("Title", 160),
  doc_date: optDate,
  issuing_agency: optText(160),
  expires_on: optDate,
  remarks: optText(500),
});

const createSchema = detailsSchema.extend({
  employee_id: z.guid(),
  category_code: reqText("Category", 40),
  related_type: z.enum(["leave_application", "attendance_correction", "hr_request", ""]).transform((v) => v || null),
  related_id: z.string().transform((v) => v || null).pipe(z.guid().nullable()),
});

export async function uploadDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireActionCtx();
  const raw = formObject(formData);
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const d = parsed.data;
  let docId: string;
  try {
    const { upload, path } = await storeUpload(ctx, d.employee_id, formData.get("file") as File | null);
    const { data, error } = await ctx.db.rpc("create_document", {
      p_employee_id: d.employee_id, p_category_code: d.category_code, p_title: d.title, p_doc_date: d.doc_date,
      p_issuing_agency: d.issuing_agency, p_expires_on: d.expires_on, p_remarks: d.remarks,
      p_related_type: d.related_type, p_related_id: d.related_id,
      p_storage_path: path, p_file_name: upload.fileName, p_mime_type: upload.mime, p_size_bytes: upload.size, p_sha256: upload.sha256,
    });
    if (error) return fail(error, "create-document");
    docId = data as string;
  } catch (e) {
    if (e instanceof UploadError) return { ok: false, error: e.message, fieldErrors: { file: e.message } };
    return fail(e, "upload-document");
  }
  revalidatePath("/documents");
  const back = raw.return_to ? safeNext(raw.return_to, "") : "";
  if (back) {
    revalidatePath(back);
    redirect(back);
  }
  redirect(`/documents/${docId}`);
}

export async function replaceDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireActionCtx();
  const raw = formObject(formData);
  const id = z.guid().safeParse(raw.document_id);
  const employeeId = z.guid().safeParse(raw.employee_id);
  const reason = (raw.reason ?? "").trim();
  if (!id.success || !employeeId.success) return { ok: false, error: "Document not found." };
  if (!reason) return { ok: false, error: "Please give a reason for replacing this file.", fieldErrors: { reason: "A reason is required." } };
  try {
    const { upload, path } = await storeUpload(ctx, employeeId.data, formData.get("file") as File | null);
    const { error } = await ctx.db.rpc("add_document_version", {
      p_document_id: id.data, p_storage_path: path, p_file_name: upload.fileName, p_mime_type: upload.mime,
      p_size_bytes: upload.size, p_sha256: upload.sha256, p_reason: reason,
    });
    if (error) return fail(error, "add-version");
  } catch (e) {
    if (e instanceof UploadError) return { ok: false, error: e.message, fieldErrors: { file: e.message } };
    return fail(e, "replace-document");
  }
  revalidatePath(`/documents/${id.data}`);
  return { ok: true, message: "New version uploaded. The previous version is kept in the history." };
}

export async function updateDocumentDetails(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireActionCtx();
  const raw = formObject(formData);
  const id = z.guid().safeParse(raw.document_id);
  const parsed = detailsSchema.safeParse(raw);
  if (!id.success) return { ok: false, error: "Document not found." };
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const d = parsed.data;
  const { error } = await ctx.db.rpc("update_document_details", {
    p_document_id: id.data, p_title: d.title, p_doc_date: d.doc_date, p_issuing_agency: d.issuing_agency, p_expires_on: d.expires_on, p_remarks: d.remarks,
  });
  if (error) return fail(error, "update-document");
  revalidatePath(`/documents/${id.data}`);
  return { ok: true, message: "Details saved." };
}

export async function reviewDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireActionCtx();
  const raw = formObject(formData);
  const id = z.guid().safeParse(raw.document_id);
  const status = z.enum(["verified", "rejected", "for_review", "archived"]).safeParse(raw.status);
  if (!id.success || !status.success) return { ok: false, error: "Invalid request." };
  const { error } = await ctx.db.rpc("set_document_status", { p_document_id: id.data, p_status: status.data, p_remarks: (raw.remarks ?? "").trim() });
  if (error) return fail(error, "review-document");
  revalidatePath(`/documents/${id.data}`);
  return { ok: true, message: `Marked as ${status.data.replace("_", " ")}.` };
}

export async function deleteDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireActionCtx();
  const raw = formObject(formData);
  const id = z.guid().safeParse(raw.document_id);
  if (!id.success) return { ok: false, error: "Document not found." };
  const { error } = await ctx.db.rpc("delete_document", { p_document_id: id.data, p_reason: (raw.reason ?? "").trim() });
  if (error) return fail(error, "delete-document");
  revalidatePath("/documents");
  redirect("/documents");
}
