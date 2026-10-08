"use server";

import { revalidatePath } from "next/cache";
import { requireActionCtx } from "@/lib/auth/session";
import { addressSchema, contactSchema } from "@/lib/validation/employee";
import { formObject } from "@/lib/validation/common";
import { fail, fieldErrorsFrom, type ActionState } from "@/lib/errors";

export async function updateContact(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireActionCtx();
  const parsed = contactSchema.safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  // Always the caller's own record: the function reads the employee from the session, not from the form.
  const { error } = await ctx.db.rpc("update_my_contact", { p_personal_email: parsed.data.personal_email, p_mobile_no: parsed.data.mobile_no });
  if (error) return fail(error, "update-contact");
  revalidatePath("/profile");
  return { ok: true, message: "Contact details saved." };
}

/** Employees save their own addresses; HR (employee.write) may save anyone's. RLS enforces both. */
export async function saveAddress(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireActionCtx();
  const raw = formObject(formData);
  const employeeId = raw.employee_id || ctx.employeeId;
  if (!employeeId) return { ok: false, error: "No employee record is linked to your account." };
  const parsed = addressSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const { error } = await ctx.db
    .from("employee_addresses")
    .upsert({ employee_id: employeeId, ...parsed.data }, { onConflict: "employee_id,address_type" });
  if (error) return fail(error, "save-address");
  revalidatePath("/profile");
  revalidatePath(`/personnel/${employeeId}`);
  return { ok: true, message: "Address saved." };
}
