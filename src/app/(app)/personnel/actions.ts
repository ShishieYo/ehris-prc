"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActionCtx } from "@/lib/auth/session";
import { coreSchema, privateSchema, statusSchema } from "@/lib/validation/employee";
import { formObject } from "@/lib/validation/common";
import { fail, fieldErrorsFrom, type ActionState } from "@/lib/errors";

/** Create or update an employee through the audited database function (permissions re-checked there). */
export async function saveEmployee(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireActionCtx();
  if (!ctx.can("employee.write")) return { ok: false, error: "You don't have permission to edit employee records." };

  const raw = formObject(formData);
  const id = raw.id || null;
  const reason = (raw.reason ?? "").trim();

  const core = coreSchema.safeParse(raw);
  const status = ctx.can("employee.manage_status") ? statusSchema.safeParse(raw) : null;
  const priv = ctx.can("employee.read_sensitive") ? privateSchema.safeParse(raw) : null;
  const issues = [...(core.success ? [] : core.error.issues), ...(status && !status.success ? status.error.issues : []), ...(priv && !priv.success ? priv.error.issues : [])];

  const c = core.success ? core.data : null;
  if (c?.current_appointment_date && c.original_appointment_date && c.current_appointment_date < c.original_appointment_date) {
    issues.push({ code: "custom", path: ["current_appointment_date"], message: "Cannot be earlier than the original appointment." } as never);
  }
  if (status?.success && status.data.separation_date && c?.original_appointment_date && status.data.separation_date < c.original_appointment_date) {
    issues.push({ code: "custom", path: ["separation_date"], message: "Cannot be earlier than the original appointment." } as never);
  }
  if (id && !reason) issues.push({ code: "custom", path: ["reason"], message: "A reason is required." } as never);
  if (issues.length || !core.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(issues) };

  const { employee_no, ...rest } = core.data;
  const payload = {
    ...rest,
    ...(id ? {} : employee_no ? { employee_no } : {}),
    ...(status?.success ? status.data : {}),
  };
  const { data, error } = await ctx.db.rpc("hr_save_employee", {
    p_employee_id: id,
    p_core: payload,
    p_private: priv?.success ? priv.data : {},
    p_reason: reason,
  });
  if (error) return fail(error, "save-employee");

  revalidatePath("/personnel");
  redirect(`/personnel/${data}`);
}
