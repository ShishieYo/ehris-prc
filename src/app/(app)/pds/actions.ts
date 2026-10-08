"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActionCtx } from "@/lib/auth/session";
import { logEvent } from "@/lib/audit";
import { schemaFor, sectionByKey } from "@/lib/pds/sections";
import { formObject } from "@/lib/validation/common";
import { fail, fieldErrorsFrom, type ActionState } from "@/lib/errors";

/** Insert or update one row of a PDS section. RLS limits this to the owner and HR. */
export async function savePdsRow(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireActionCtx();
  const raw = formObject(formData);
  const def = sectionByKey(raw.section ?? "");
  const employeeId = z.uuid().safeParse(raw.employee_id);
  if (!def || !employeeId.success) return { ok: false, error: "That section could not be found." };

  const parsed = schemaFor(def).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  // Dynamic table name: the section key is validated against the fixed PDS_SECTIONS list above.
  const table = ctx.db.from(def.table) as unknown as {
    insert: (v: object) => Promise<{ error: unknown }>;
    update: (v: object) => { eq: (c: string, v: string) => { eq: (c: string, v: string) => Promise<{ error: unknown }> } };
  };
  const rowId = raw.id ? z.uuid().safeParse(raw.id) : null;
  const result = rowId?.success
    ? await table.update(parsed.data).eq("id", rowId.data).eq("employee_id", employeeId.data)
    : await table.insert({ ...parsed.data, employee_id: employeeId.data });
  if (result.error) return fail(result.error, `pds-${def.key}`);
  revalidatePath(`/pds/${employeeId.data}`);
  return { ok: true, message: rowId?.success ? "Entry updated." : "Entry added." };
}

export async function deletePdsRow(formData: FormData): Promise<void> {
  const ctx = await requireActionCtx();
  const raw = formObject(formData);
  const def = sectionByKey(raw.section ?? "");
  const id = z.uuid().safeParse(raw.id);
  const employeeId = z.uuid().safeParse(raw.employee_id);
  if (!def || !id.success || !employeeId.success) return;
  const table = ctx.db.from(def.table) as unknown as {
    delete: () => { eq: (c: string, v: string) => { eq: (c: string, v: string) => Promise<{ error: unknown }> } };
  };
  const { error } = await table.delete().eq("id", id.data).eq("employee_id", employeeId.data);
  if (error) console.error(JSON.stringify({ level: "error", context: "pds-delete", message: String((error as Error).message) }));
  revalidatePath(`/pds/${employeeId.data}`);
}

export async function saveDeclaration(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireActionCtx();
  const raw = formObject(formData);
  const employeeId = z.uuid().safeParse(raw.employee_id);
  if (!employeeId.success) return { ok: false, error: "Employee not found." };
  const rows = Object.keys(raw)
    .filter((k) => k.startsWith("answer_"))
    .map((k) => {
      const code = k.slice("answer_".length);
      return { employee_id: employeeId.data, question_code: code, answer: raw[k] === "yes", details: (raw[`details_${code}`] ?? "").trim() || null };
    });
  const missing = rows.filter((r) => r.answer && !r.details);
  if (missing.length) return { ok: false, error: "Please give details for every question answered Yes." };
  const { error } = await ctx.db.from("pds_declaration_answers").upsert(rows, { onConflict: "employee_id,question_code" });
  if (error) return fail(error, "pds-declaration");
  revalidatePath(`/pds/${employeeId.data}`);
  return { ok: true, message: "Declaration saved." };
}

export async function certifyPds(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireActionCtx();
  if (formData.get("confirm") !== "on") return { ok: false, error: "Please tick the box to certify your PDS." };
  const { error } = await ctx.db.rpc("pds_certify");
  if (error) return fail(error, "pds-certify");
  await logEvent(ctx, "pds.certified", "pds", { entityType: "employees", entityId: ctx.employeeId ?? undefined, subjectEmployeeId: ctx.employeeId ?? undefined });
  revalidatePath(`/pds/${ctx.employeeId}`);
  return { ok: true, message: "Your PDS has been certified and sent to HR for verification." };
}

export async function reviewPds(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireActionCtx();
  const raw = formObject(formData);
  const employeeId = z.uuid().safeParse(raw.employee_id);
  const kind = z.enum(["verified", "returned"]).safeParse(raw.kind);
  if (!employeeId.success || !kind.success) return { ok: false, error: "Invalid request." };
  const { error } = await ctx.db.rpc("pds_review", { p_employee: employeeId.data, p_kind: kind.data, p_remarks: (raw.remarks ?? "").trim() });
  if (error) return fail(error, "pds-review");
  revalidatePath(`/pds/${employeeId.data}`);
  return { ok: true, message: kind.data === "verified" ? "PDS marked as verified." : "PDS returned to the employee." };
}
