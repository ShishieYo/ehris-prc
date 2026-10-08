"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActionCtx } from "@/lib/auth/session";
import { adminTableByKey, type AdminField } from "@/lib/admin/tables";
import { formObject, optDate, optInt, optText, optUuid, reqDate, reqText } from "@/lib/validation/common";
import { fail, fieldErrorsFrom, type ActionState } from "@/lib/errors";

function schemaFor(fields: AdminField[], editing: boolean) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of fields) {
    if (f.immutable && editing) continue;
    switch (f.type) {
      case "checkbox": shape[f.name] = z.string().optional().transform((v) => v === "on"); break;
      case "number": shape[f.name] = optInt(0, 100000); break;
      case "date": shape[f.name] = f.required ? reqDate(f.label) : optDate; break;
      case "select": shape[f.name] = f.required ? z.string().trim().min(1, `Choose ${f.label.toLowerCase()}.`) : f.options === "org_units" || f.options === "positions" || f.options === "employees" ? optUuid : optText(80); break;
      default: shape[f.name] = f.required ? reqText(f.label, 400) : optText(400);
    }
  }
  return z.object(shape);
}

/** Generic create/update for configuration tables. RLS decides who may write each table. */
export async function saveAdminRow(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireActionCtx();
  const raw = formObject(formData);
  const def = adminTableByKey(raw.table ?? "");
  if (!def) return { ok: false, error: "Unknown configuration table." };
  if (!ctx.can(def.permission)) return { ok: false, error: "You don't have permission to change this configuration." };
  const editingKey = raw.pk_value || null;
  const parsed = schemaFor(def.fields, !!editingKey).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const table = ctx.db.from(def.table) as unknown as {
    insert: (v: object) => Promise<{ error: unknown }>;
    update: (v: object) => { eq: (c: string, v: string) => Promise<{ error: unknown }> };
  };
  const { error } = editingKey ? await table.update(parsed.data).eq(def.pk, editingKey) : await table.insert(parsed.data);
  if (error) return fail(error, `admin-${def.key}`);
  revalidatePath(`/admin/t/${def.key}`);
  redirect(`/admin/t/${def.key}`);
}

export async function deleteAdminRow(formData: FormData): Promise<void> {
  const ctx = await requireActionCtx();
  const raw = formObject(formData);
  const def = adminTableByKey(raw.table ?? "");
  if (!def || !ctx.can(def.permission) || !raw.pk_value) return;
  const table = ctx.db.from(def.table) as unknown as { delete: () => { eq: (c: string, v: string) => Promise<{ error: { message?: string } | null }> } };
  const { error } = await table.delete().eq(def.pk, raw.pk_value);
  if (error) {
    // Typically a foreign-key restriction: the value is in use. Deactivate it instead.
    redirect(`/admin/t/${def.key}?notice=${encodeURIComponent("That item is in use and can't be deleted. Mark it inactive instead.")}`);
  }
  revalidatePath(`/admin/t/${def.key}`);
}
