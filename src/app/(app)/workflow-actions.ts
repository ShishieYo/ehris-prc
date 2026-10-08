"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActionCtx } from "@/lib/auth/session";
import { formObject } from "@/lib/validation/common";
import { fail, type ActionState } from "@/lib/errors";

const entity = z.enum(["leave_application", "attendance_correction", "hr_request"]);
const BASE: Record<z.infer<typeof entity>, string> = {
  leave_application: "/leave",
  attendance_correction: "/attendance/corrections",
  hr_request: "/requests",
};

function refresh(type: z.infer<typeof entity>, id: string) {
  revalidatePath(`${BASE[type]}/${id}`);
  revalidatePath(BASE[type]);
  revalidatePath("/approvals");
  revalidatePath("/dashboard");
}

/** Requester sends a draft into the configured workflow. */
export async function submitRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireActionCtx();
  const raw = formObject(formData);
  const type = entity.safeParse(raw.entity_type);
  const id = z.uuid().safeParse(raw.entity_id);
  if (!type.success || !id.success) return { ok: false, error: "Request not found." };
  const { error } = await ctx.db.rpc("wf_submit", { p_type: type.data, p_id: id.data });
  if (error) return fail(error, "wf-submit");
  refresh(type.data, id.data);
  return { ok: true, message: "Submitted. You'll be notified at each step." };
}

/** Approve / reject / return / cancel. Whether the caller may do so is decided by the database. */
export async function actOnRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireActionCtx();
  const raw = formObject(formData);
  const type = entity.safeParse(raw.entity_type);
  const id = z.uuid().safeParse(raw.entity_id);
  const action = z.enum(["approve", "reject", "return", "cancel"]).safeParse(raw.action);
  if (!type.success || !id.success || !action.success) return { ok: false, error: "Invalid request." };
  const { error } = await ctx.db.rpc("wf_act", { p_type: type.data, p_id: id.data, p_action: action.data, p_remarks: (raw.remarks ?? "").trim() || null });
  if (error) return fail(error, "wf-act");
  refresh(type.data, id.data);
  const done = { approve: "Approved.", reject: "Rejected.", return: "Returned to the requester.", cancel: "Cancelled." }[action.data];
  return { ok: true, message: done };
}

export async function commentOnRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireActionCtx();
  const raw = formObject(formData);
  const type = entity.safeParse(raw.entity_type);
  const id = z.uuid().safeParse(raw.entity_id);
  if (!type.success || !id.success) return { ok: false, error: "Invalid request." };
  const { error } = await ctx.db.rpc("wf_comment", { p_type: type.data, p_id: id.data, p_remarks: (raw.remarks ?? "").trim() });
  if (error) return fail(error, "wf-comment");
  refresh(type.data, id.data);
  return { ok: true, message: "Comment added." };
}
