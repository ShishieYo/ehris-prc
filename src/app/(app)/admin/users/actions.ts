"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActionCtx } from "@/lib/auth/session";
import { createAdminDb } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { formObject, optUuid, reqText } from "@/lib/validation/common";
import { fail, fieldErrorsFrom, type ActionState } from "@/lib/errors";

const provisionSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  display_name: reqText("Name", 120),
  employee_id: optUuid,
});

const rolesOf = (fd: FormData) => fd.getAll("roles").filter((v): v is string => typeof v === "string");

/**
 * Invite a new user. The caller's permission is verified BEFORE the service-role
 * client is used; the person sets their own password from the invitation email.
 */
export async function provisionUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireActionCtx();
  if (!ctx.can("admin.users")) return { ok: false, error: "You don't have permission to manage users." };
  const parsed = provisionSchema.safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  const roles = rolesOf(formData);
  if (roles.length === 0) return { ok: false, error: "Choose at least one role." };

  let admin;
  try {
    admin = createAdminDb();
  } catch {
    return { ok: false, error: "User invitations aren't configured on this server (service key missing). Contact the system administrator." };
  }
  const { data, error } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, { redirectTo: `${env().APP_URL}/auth/callback?next=/reset-password` });
  if (error || !data.user) return fail(error ?? new Error("invite failed"), "invite-user");

  const { error: rpcError } = await ctx.db.rpc("admin_provision_user", {
    p_user_id: data.user.id, p_email: parsed.data.email, p_display_name: parsed.data.display_name, p_employee_id: parsed.data.employee_id, p_role_codes: roles,
  });
  if (rpcError) {
    await admin.auth.admin.deleteUser(data.user.id); // don't leave an orphan login without a profile
    return fail(rpcError, "provision-user");
  }
  revalidatePath("/admin/users");
  return { ok: true, message: `Invitation sent to ${parsed.data.email}.` };
}

export async function updateUserRoles(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireActionCtx();
  const id = z.uuid().safeParse(formObject(formData).user_id);
  if (!id.success) return { ok: false, error: "User not found." };
  const { error } = await ctx.db.rpc("admin_set_user_roles", { p_user: id.data, p_role_codes: rolesOf(formData) });
  if (error) return fail(error, "set-roles");
  revalidatePath("/admin/users");
  return { ok: true, message: "Roles updated." };
}

export async function setUserActive(formData: FormData): Promise<void> {
  const ctx = await requireActionCtx();
  const raw = formObject(formData);
  const id = z.uuid().safeParse(raw.user_id);
  if (!id.success) return;
  await ctx.db.rpc("admin_set_user_active", { p_user: id.data, p_active: raw.active === "true" });
  revalidatePath("/admin/users");
}
