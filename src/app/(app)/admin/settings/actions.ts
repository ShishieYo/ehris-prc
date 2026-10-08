"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActionCtx } from "@/lib/auth/session";
import { formObject } from "@/lib/validation/common";
import { fail, type ActionState } from "@/lib/errors";

/** Known settings are validated by type; unknown keys must still be valid JSON. */
const KNOWN: Record<string, z.ZodType> = {
  "org.name": z.string().min(1).max(120),
  "privacy.notice_version": z.string().min(1).max(40),
  "documents.max_size_mb": z.number().min(1).max(50),
  "documents.allowed_mime": z.array(z.enum(["application/pdf", "image/jpeg", "image/png"])).min(1),
  "notifications.channels": z.array(z.enum(["in_app", "email", "sms"])).min(1),
  "audit.capture_network_metadata": z.boolean(),
};

export async function saveSetting(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireActionCtx();
  const raw = formObject(formData);
  let value: unknown;
  try {
    value = JSON.parse(raw.value ?? "");
  } catch {
    return { ok: false, error: "The value must be valid JSON (e.g. true, 10, \"text\", or [\"a\",\"b\"]).", fieldErrors: { value: "Not valid JSON." } };
  }
  const rule = KNOWN[raw.key ?? ""];
  if (rule) {
    const parsed = rule.safeParse(value);
    if (!parsed.success) return { ok: false, error: "That value isn't allowed for this setting.", fieldErrors: { value: "Not allowed for this setting." } };
  }
  const { error } = await ctx.db.from("system_settings").update({ value: value as never, updated_by: ctx.userId, updated_at: new Date().toISOString() }).eq("key", raw.key);
  if (error) return fail(error, "save-setting");
  revalidatePath("/admin/settings");
  return { ok: true, message: "Setting saved." };
}
