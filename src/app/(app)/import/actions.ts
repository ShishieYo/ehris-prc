"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActionCtx } from "@/lib/auth/session";
import { getLookups } from "@/lib/data/lookups";
import { logEvent } from "@/lib/audit";
import { EMPLOYEE_IMPORT_FIELDS, suggestMapping } from "@/lib/import/fields";
import { ImportParseError, parseSpreadsheet } from "@/lib/import/parse";
import { validateRows, type RefData } from "@/lib/import/validate";
import { formObject } from "@/lib/validation/common";
import { fail, type ActionState } from "@/lib/errors";

const CHUNK = 500;

export async function uploadImport(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireActionCtx();
  if (!ctx.can("import.run")) return { ok: false, error: "You don't have permission to run imports." };
  const file = formData.get("file") as File | null;
  if (!file) return { ok: false, error: "Choose a .csv or .xlsx file." };
  let sheet;
  try {
    sheet = await parseSpreadsheet(file);
  } catch (e) {
    if (e instanceof ImportParseError) return { ok: false, error: e.message };
    return fail(e, "import-parse");
  }

  const { data: batch, error } = await ctx.db
    .from("import_batches")
    .insert({ kind: "employees", file_name: file.name.slice(0, 200), total_rows: sheet.rows.length, mapping: suggestMapping(sheet.headers) })
    .select("id")
    .single();
  if (error) return fail(error, "import-batch");

  for (let i = 0; i < sheet.rows.length; i += CHUNK) {
    const chunk = sheet.rows.slice(i, i + CHUNK).map((raw, j) => ({ batch_id: batch.id, row_no: i + j + 2, raw, status: "pending" }));
    const { error: rowErr } = await ctx.db.from("import_rows").insert(chunk);
    if (rowErr) {
      await ctx.db.from("import_batches").update({ status: "cancelled" }).eq("id", batch.id);
      return fail(rowErr, "import-rows");
    }
  }
  redirect(`/import/${batch.id}`);
}

async function loadReferenceData(ctx: Awaited<ReturnType<typeof requireActionCtx>>): Promise<RefData> {
  const lookups = await getLookups(ctx);
  const [emps, priv] = await Promise.all([
    ctx.db.from("employees").select("id, employee_no, prc_employee_no, first_name, last_name").limit(50000),
    ctx.db.from("employee_private").select("employee_id, tin, gsis_bp_no, philhealth_no, pagibig_no, birth_date").limit(50000),
  ]);
  if (emps.error) throw emps.error;
  if (priv.error) throw priv.error;
  const lc = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
  const byId = new Map((emps.data ?? []).map((e) => [e.id, e]));
  const set = (vals: (string | null)[]) => new Set(vals.filter(Boolean).map((v) => lc(v)));
  return {
    positions: lookups.positions.map((p) => ({ id: p.id, code: p.code, title: p.title })),
    orgUnits: lookups.orgUnits.map((u) => ({ id: u.id, code: u.code, name: u.name })),
    statuses: lookups.employmentStatuses.map((s) => ({ code: s.code, name: s.name })),
    existing: {
      employeeNos: set((emps.data ?? []).map((e) => e.employee_no)),
      prcNos: set((emps.data ?? []).map((e) => e.prc_employee_no)),
      tins: set((priv.data ?? []).map((p) => p.tin)),
      gsis: set((priv.data ?? []).map((p) => p.gsis_bp_no)),
      philhealth: set((priv.data ?? []).map((p) => p.philhealth_no)),
      pagibig: set((priv.data ?? []).map((p) => p.pagibig_no)),
      nameDob: new Set((priv.data ?? []).flatMap((p) => { const e = byId.get(p.employee_id); return e && p.birth_date ? [lc(`${e.last_name}|${e.first_name}|${p.birth_date}`)] : []; })),
      supervisorIdsByNo: new Map((emps.data ?? []).map((e) => [lc(e.employee_no), e.id])),
    },
  };
}

/** Save the column mapping, validate every row, and store results for preview. Nothing is imported yet. */
export async function mapAndValidate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireActionCtx();
  if (!ctx.can("import.run")) return { ok: false, error: "You don't have permission to run imports." };
  const raw = formObject(formData);
  const id = z.guid().safeParse(raw.batch_id);
  if (!id.success) return { ok: false, error: "Import not found." };

  const mapping: Record<string, string> = {};
  for (const f of EMPLOYEE_IMPORT_FIELDS) if (raw[`map_${f.key}`]) mapping[f.key] = raw[`map_${f.key}`];
  const missing = EMPLOYEE_IMPORT_FIELDS.filter((f) => f.required && !mapping[f.key]);
  if (missing.length) return { ok: false, error: `Map the required column(s): ${missing.map((m) => m.label).join(", ")}.` };

  const { data: batch } = await ctx.db.from("import_batches").select("*").eq("id", id.data).maybeSingle();
  if (!batch || batch.status === "committed" || batch.status === "cancelled") return { ok: false, error: "This import can no longer be changed." };

  const { data: rows, error } = await ctx.db.from("import_rows").select("row_no, raw").eq("batch_id", id.data).order("row_no");
  if (error) return fail(error, "import-load");
  const mapped = (rows ?? []).map((r) => {
    const src = r.raw as Record<string, string>;
    return Object.fromEntries(Object.entries(mapping).map(([field, header]) => [field, src[header] ?? ""]));
  });
  const results = validateRows(mapped, await loadReferenceData(ctx));

  const updates = (rows ?? []).map((r, i) => ({
    batch_id: id.data, row_no: r.row_no, raw: r.raw,
    normalized: results[i].normalized as never, errors: results[i].issues as never,
    status: results[i].issues.length ? "error" : "valid",
  }));
  for (let i = 0; i < updates.length; i += CHUNK) {
    const { error: upErr } = await ctx.db.from("import_rows").upsert(updates.slice(i, i + CHUNK), { onConflict: "batch_id,row_no" });
    if (upErr) return fail(upErr, "import-validate");
  }
  const errorRows = results.filter((r) => r.issues.length).length;
  await ctx.db.from("import_batches").update({ mapping, status: "validated", valid_rows: results.length - errorRows, error_rows: errorRows }).eq("id", id.data);
  await logEvent(ctx, "import.previewed", "import", { entityType: "import_batches", entityId: id.data, metadata: { rows: results.length, errors: errorRows } });
  revalidatePath(`/import/${id.data}`);
  return { ok: true, message: `Checked ${results.length} rows: ${results.length - errorRows} ready, ${errorRows} with problems.` };
}

export async function confirmImport(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireActionCtx();
  const id = z.guid().safeParse(formObject(formData).batch_id);
  if (!id.success) return { ok: false, error: "Import not found." };
  const { data, error } = await ctx.db.rpc("commit_employee_import", { p_batch: id.data });
  if (error) return fail(error, "import-commit");
  revalidatePath(`/import/${id.data}`);
  revalidatePath("/personnel");
  const r = data as { imported: number; failed: number };
  return { ok: true, message: `Imported ${r.imported} employee record(s)${r.failed ? `; ${r.failed} could not be created (see below)` : ""}.` };
}

export async function cancelImport(formData: FormData): Promise<void> {
  const ctx = await requireActionCtx();
  const id = z.guid().safeParse(formObject(formData).batch_id);
  if (!id.success) return;
  await ctx.db.from("import_batches").update({ status: "cancelled" }).eq("id", id.data).neq("status", "committed");
  revalidatePath("/import");
  redirect("/import");
}
