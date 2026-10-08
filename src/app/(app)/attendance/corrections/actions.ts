"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActionCtx } from "@/lib/auth/session";
import { formObject, optText, reqDate } from "@/lib/validation/common";
import { manilaLocalToIso, todayManila } from "@/lib/format";
import { fail, fieldErrorsFrom, toUserMessage, type ActionState } from "@/lib/errors";

const localDateTime = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v), "Enter a valid date and time.")
  .transform((v) => (v === "" ? null : manilaLocalToIso(v)));

const schema = z
  .object({
    work_date: reqDate("Date"),
    correction_type: z.enum(["missing_time_in", "missing_time_out", "incorrect_time", "absent_but_present", "other"]),
    proposed_time_in: localDateTime,
    proposed_time_out: localDateTime,
    reason: z.string().trim().min(5, "Please explain what happened (at least 5 characters).").max(1000),
    remarks: optText(500),
  })
  .refine((v) => v.work_date <= todayManila(), { path: ["work_date"], message: "The date cannot be in the future." })
  .refine((v) => !v.proposed_time_in || !v.proposed_time_out || v.proposed_time_out > v.proposed_time_in, { path: ["proposed_time_out"], message: "Time out must be after time in." });

export async function saveCorrection(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireActionCtx();
  if (!ctx.employeeId) return { ok: false, error: "No employee record is linked to your account." };
  const raw = formObject(formData);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const id = raw.id ? z.uuid().safeParse(raw.id) : null;
  const row = { ...parsed.data, employee_id: ctx.employeeId };
  let savedId: string;
  if (id?.success) {
    const { error } = await ctx.db.from("attendance_corrections").update(row).eq("id", id.data);
    if (error) return fail(error, "update-correction");
    savedId = id.data;
  } else {
    const { data, error } = await ctx.db.from("attendance_corrections").insert(row).select("id").single();
    if (error) return fail(error, "create-correction");
    savedId = data.id;
  }

  let notice = "";
  if (raw.intent === "submit") {
    const { error } = await ctx.db.rpc("wf_submit", { p_type: "attendance_correction", p_id: savedId });
    if (error) notice = `?error=${encodeURIComponent(`Saved as a draft, but it couldn't be submitted: ${toUserMessage(error, "wf-submit")}`)}`;
  }
  revalidatePath("/attendance/corrections");
  revalidatePath("/approvals");
  redirect(`/attendance/corrections/${savedId}${notice}`);
}

export async function deleteCorrectionDraft(formData: FormData): Promise<void> {
  const ctx = await requireActionCtx();
  const id = z.uuid().safeParse(formObject(formData).id);
  if (!id.success) return;
  await ctx.db.from("attendance_corrections").delete().eq("id", id.data);
  revalidatePath("/attendance/corrections");
  redirect("/attendance/corrections");
}
