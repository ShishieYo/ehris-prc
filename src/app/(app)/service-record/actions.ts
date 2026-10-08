"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActionCtx } from "@/lib/auth/session";
import { formObject, optDate, optInt, optNumber, optText, optUuid, reqDate, reqText } from "@/lib/validation/common";
import { fail, fieldErrorsFrom, type ActionState } from "@/lib/errors";

const schema = z
  .object({
    employee_id: z.guid(),
    date_from: reqDate("Start date"),
    date_to: optDate,
    record_type: z.enum(["appointment", "promotion", "transfer", "salary_adjustment", "reinstatement", "separation", "other"]),
    position_title: reqText("Position", 160),
    appointment_status: optText(80),
    office: optText(160),
    station: optText(160),
    monthly_salary: optNumber(0, 10_000_000),
    salary_grade: optInt(1, 33),
    salary_step: optInt(1, 8),
    lwop_days: optInt(0, 3660),
    separation_cause: optText(200),
    remarks: optText(500),
    document_id: optUuid,
  })
  .refine((v) => !v.date_to || v.date_to >= v.date_from, { path: ["date_to"], message: "End date cannot be earlier than the start date." });

export async function saveServiceRecord(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireActionCtx();
  if (!ctx.can("service_record.write")) return { ok: false, error: "You don't have permission to edit service records." };
  const raw = formObject(formData);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const row = { ...parsed.data, lwop_days: parsed.data.lwop_days ?? 0 };
  const id = raw.id ? z.guid().safeParse(raw.id) : null;
  const { error } = id?.success
    ? await ctx.db.from("service_records").update(row).eq("id", id.data)
    : await ctx.db.from("service_records").insert(row);
  if (error) return fail(error, "save-service-record");
  revalidatePath(`/service-record/${row.employee_id}`);
  return { ok: true, message: "Service record entry saved." };
}

export async function deleteServiceRecord(formData: FormData): Promise<void> {
  const ctx = await requireActionCtx();
  const raw = formObject(formData);
  const id = z.guid().safeParse(raw.id);
  const emp = z.guid().safeParse(raw.employee_id);
  if (!id.success || !emp.success || !ctx.can("service_record.write")) return;
  await ctx.db.from("service_records").delete().eq("id", id.data);
  revalidatePath(`/service-record/${emp.data}`);
}
