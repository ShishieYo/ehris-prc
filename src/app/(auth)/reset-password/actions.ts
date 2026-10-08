"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createDb } from "@/lib/supabase/server";
import { passwordSchema } from "@/lib/validation/password";
import { fieldErrorsFrom, toUserMessage, type ActionState } from "@/lib/errors";

const schema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match." });

export async function updatePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const db = await createDb();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login?reason=link-invalid");

  const { error } = await db.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: toUserMessage(error, "password-update") };

  await db.rpc("log_event", { p_action: "auth.password_changed", p_module: "access" });
  redirect("/dashboard");
}
