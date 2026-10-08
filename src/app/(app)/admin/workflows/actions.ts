"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActionCtx } from "@/lib/auth/session";
import { formObject, optInt, reqText } from "@/lib/validation/common";
import { fail, fieldErrorsFrom, type ActionState } from "@/lib/errors";

const stepSchema = z
  .object({
    workflow_code: reqText("Workflow", 60),
    step_order: optInt(1, 20).pipe(z.number({ error: "Enter the step number." })),
    name: reqText("Step name", 80),
    actor_kind: z.enum(["supervisor", "permission"]),
    required_permission: z.string().trim().transform((v) => v || null),
    status_on_approve: z.enum(["in_review", "approved", "completed"]),
  })
  .refine((v) => v.actor_kind === "supervisor" || !!v.required_permission, { path: ["required_permission"], message: "Choose the permission that may act on this step." });

export async function saveStep(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireActionCtx();
  const raw = formObject(formData);
  const parsed = stepSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const row = { ...parsed.data, required_permission: parsed.data.actor_kind === "supervisor" ? null : parsed.data.required_permission };
  const id = raw.step_id ? z.guid().safeParse(raw.step_id) : null;
  const { error } = id?.success ? await ctx.db.from("workflow_steps").update(row).eq("id", id.data) : await ctx.db.from("workflow_steps").insert(row);
  if (error) return fail(error, "save-step");
  revalidatePath("/admin/workflows");
  return { ok: true, message: "Step saved." };
}

export async function deleteStep(formData: FormData): Promise<void> {
  const ctx = await requireActionCtx();
  const id = z.guid().safeParse(formObject(formData).step_id);
  if (!id.success) return;
  await ctx.db.from("workflow_steps").delete().eq("id", id.data);
  revalidatePath("/admin/workflows");
}

export async function toggleWorkflow(formData: FormData): Promise<void> {
  const ctx = await requireActionCtx();
  const raw = formObject(formData);
  await ctx.db.from("workflows").update({ is_active: raw.active === "true" }).eq("code", raw.code);
  revalidatePath("/admin/workflows");
}
