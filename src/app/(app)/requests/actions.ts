"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActionCtx } from "@/lib/auth/session";
import { formObject, optText, reqText } from "@/lib/validation/common";
import { fail, fieldErrorsFrom, toUserMessage, type ActionState } from "@/lib/errors";

const schema = z.object({
  request_type_code: reqText("Request type", 40),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  subject: reqText("Subject", 160),
  details: optText(2000),
});

export async function saveHrRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireActionCtx();
  if (!ctx.employeeId) return { ok: false, error: "No employee record is linked to your account." };
  const raw = formObject(formData);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const row = { ...parsed.data, employee_id: ctx.employeeId };
  const id = raw.id ? z.uuid().safeParse(raw.id) : null;
  let savedId: string;
  if (id?.success) {
    const { error } = await ctx.db.from("hr_requests").update(row).eq("id", id.data);
    if (error) return fail(error, "update-hr-request");
    savedId = id.data;
  } else {
    const { data, error } = await ctx.db.from("hr_requests").insert(row).select("id").single();
    if (error) return fail(error, "create-hr-request");
    savedId = data.id;
  }
  let notice = "";
  if (raw.intent === "submit") {
    const { error } = await ctx.db.rpc("wf_submit", { p_type: "hr_request", p_id: savedId });
    if (error) notice = `?error=${encodeURIComponent(`Saved as a draft, but it couldn't be submitted: ${toUserMessage(error, "wf-submit")}`)}`;
  }
  revalidatePath("/requests");
  revalidatePath("/approvals");
  redirect(`/requests/${savedId}${notice}`);
}

export async function deleteHrDraft(formData: FormData): Promise<void> {
  const ctx = await requireActionCtx();
  const id = z.uuid().safeParse(formObject(formData).id);
  if (!id.success) return;
  await ctx.db.from("hr_requests").delete().eq("id", id.data);
  revalidatePath("/requests");
  redirect("/requests");
}

export async function assignHrRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireActionCtx();
  const raw = formObject(formData);
  const req = z.uuid().safeParse(raw.request_id);
  const user = z.uuid().safeParse(raw.user_id);
  if (!req.success || !user.success) return { ok: false, error: "Choose a staff member." };
  const { error } = await ctx.db.rpc("hr_request_assign", { p_request: req.data, p_user: user.data });
  if (error) return fail(error, "assign-request");
  revalidatePath(`/requests/${req.data}`);
  return { ok: true, message: "Assigned." };
}

export async function attachResult(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireActionCtx();
  const raw = formObject(formData);
  const req = z.uuid().safeParse(raw.request_id);
  const doc = z.uuid().safeParse(raw.document_id);
  if (!req.success || !doc.success) return { ok: false, error: "Choose the generated document." };
  const { error } = await ctx.db.rpc("hr_request_attach_result", { p_request: req.data, p_document: doc.data });
  if (error) return fail(error, "attach-result");
  revalidatePath(`/requests/${req.data}`);
  return { ok: true, message: "Document linked. The request can now be released." };
}
