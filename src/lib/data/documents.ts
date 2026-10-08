import "server-only";
import { notFound } from "next/navigation";
import type { Ctx } from "@/lib/auth/session";
import type { Row } from "@/lib/db/types";
import { UploadError, prepareUpload, storagePath, BUCKET, type PreparedUpload } from "@/lib/documents/upload";

export async function listDocuments(ctx: Ctx, employeeId: string, category?: string) {
  let q = ctx.db.from("documents").select("*").eq("employee_id", employeeId).order("created_at", { ascending: false });
  if (category) q = q.eq("category_code", category);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getDocument(ctx: Ctx, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: doc, error } = await ctx.db.from("documents").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!doc) notFound();
  const { data: versions, error: vErr } = await ctx.db.from("document_versions").select("*").eq("document_id", id).order("version_no", { ascending: false });
  if (vErr) throw vErr;
  return { doc, versions: versions ?? [] };
}

export async function uploadSettings(ctx: Ctx) {
  const { data } = await ctx.db.from("system_settings").select("key, value").in("key", ["documents.max_size_mb", "documents.allowed_mime"]);
  const get = (k: string) => data?.find((s) => s.key === k)?.value;
  return {
    maxMb: Number(get("documents.max_size_mb") ?? 10),
    allowedMime: (get("documents.allowed_mime") as string[] | undefined) ?? ["application/pdf", "image/jpeg", "image/png"],
  };
}

/** Validates the file and stores it in the private bucket; returns what the registering RPC needs. */
export async function storeUpload(ctx: Ctx, employeeId: string, file: File | null): Promise<{ upload: PreparedUpload; path: string }> {
  const settings = await uploadSettings(ctx);
  const upload = await prepareUpload(file, settings);
  const path = storagePath(employeeId, upload.extension);
  const { error } = await ctx.db.storage.from(BUCKET).upload(path, upload.bytes, { contentType: upload.mime, upsert: false });
  if (error) {
    // Storage RLS rejects uploads into other employees' folders.
    throw new UploadError("We couldn't store the file. You may not have permission to upload for this employee.");
  }
  return { upload, path };
}

export type DocumentRow = Row<"documents">;
