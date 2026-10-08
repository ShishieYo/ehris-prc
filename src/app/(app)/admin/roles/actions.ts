"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActionCtx } from "@/lib/auth/session";
import { formObject } from "@/lib/validation/common";
import { fail, type ActionState } from "@/lib/errors";

export async function saveRole(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireActionCtx();
  const raw = formObject(formData);
  const id = raw.role_id ? z.guid().safeParse(raw.role_id) : null;
  if (raw.role_id && !id?.success) return { ok: false, error: "Role not found." };
  if (!raw.name?.trim()) return { ok: false, error: "Enter a role name.", fieldErrors: { name: "A name is required." } };
  const perms = formData.getAll("permissions").filter((v): v is string => typeof v === "string");
  const { data, error } = await ctx.db.rpc("admin_save_role", {
    p_role_id: id?.success ? id.data : null,
    p_code: (raw.code ?? "").trim().toUpperCase(),
    p_name: raw.name.trim(),
    p_description: (raw.description ?? "").trim() || null,
    p_permission_codes: perms,
  });
  if (error) return fail(error, "save-role");
  revalidatePath("/admin/roles");
  redirect(`/admin/roles/${data}`);
}
