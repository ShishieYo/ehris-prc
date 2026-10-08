"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActionCtx } from "@/lib/auth/session";
import { formObject, optNumber, optText, reqDate } from "@/lib/validation/common";
import { fail, fieldErrorsFrom, toUserMessage, type ActionState } from "@/lib/errors";

const leaveSchema = z
  .object({
    leave_type_code: z.string().trim().min(1, "Choose a leave type."),
    date_from: reqDate("Start date"),
    date_to: reqDate("End date"),
    days: optNumber(0.5, 365),
    reason: optText(500),
  })
  .refine((v) => v.date_to >= v.date_from, { path: ["date_to"], message: "End date cannot be before the start date." });

export async function saveLeave(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireActionCtx();
  if (!ctx.employeeId) return { ok: false, error: "No employee record is linked to your account." };
  const raw = formObject(formData);
  const parsed = leaveSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const row = { ...parsed.data, employee_id: ctx.employeeId };
  const id = raw.id ? z.uuid().safeParse(raw.id) : null;
  let savedId: string;
  if (id?.success) {
    const { error } = await ctx.db.from("leave_applications").update(row).eq("id", id.data);
    if (error) return fail(error, "update-leave");
    savedId = id.data;
  } else {
    const { data, error } = await ctx.db.from("leave_applications").insert(row).select("id").single();
    if (error) return fail(error, "create-leave");
    savedId = data.id;
  }
  let notice = "";
  if (raw.intent === "submit") {
    const { error } = await ctx.db.rpc("wf_submit", { p_type: "leave_application", p_id: savedId });
    if (error) notice = `?error=${encodeURIComponent(`Saved as a draft, but it couldn't be submitted: ${toUserMessage(error, "wf-submit")}`)}`;
  }
  revalidatePath("/leave");
  revalidatePath("/approvals");
  redirect(`/leave/${savedId}${notice}`);
}

export async function deleteLeaveDraft(formData: FormData): Promise<void> {
  const ctx = await requireActionCtx();
  const id = z.uuid().safeParse(formObject(formData).id);
  if (!id.success) return;
  await ctx.db.from("leave_applications").delete().eq("id", id.data);
  revalidatePath("/leave");
  redirect("/leave");
}

const balanceSchema = z.object({
  employee_id: z.uuid(),
  leave_type_code: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  beginning: z.coerce.number().min(0).max(1000),
  earned: z.coerce.number().min(0).max(1000),
  used: z.coerce.number().min(0).max(1000),
});

/** HR maintains balances; no entitlement is inferred by the system. */
export async function saveBalance(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireActionCtx();
  if (!ctx.can("leave.manage")) return { ok: false, error: "You don't have permission to manage leave balances." };
  const parsed = balanceSchema.safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, error: "Please check the numbers.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const { error } = await ctx.db.from("leave_balances").upsert(parsed.data, { onConflict: "employee_id,leave_type_code,year" });
  if (error) return fail(error, "save-balance");
  revalidatePath("/leave");
  return { ok: true, message: "Balance saved." };
}
