"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCtx } from "@/lib/auth/session";
import { createDb } from "@/lib/supabase/server";
import { fail, type ActionState } from "@/lib/errors";

export async function acceptPrivacy(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await getCtx();
  if (!ctx) redirect("/login");
  if (formData.get("agree") !== "on") return { ok: false, error: "Please tick the box to confirm you have read the notice." };
  const { error } = await ctx.db.rpc("acknowledge_privacy", { p_version: ctx.currentPrivacyVersion });
  if (error) return fail(error, "acknowledge-privacy");
  await ctx.db.rpc("log_event", { p_action: "privacy.acknowledged", p_module: "access", p_metadata: { version: ctx.currentPrivacyVersion } });
  redirect("/dashboard");
}

export async function signOut(formData?: FormData): Promise<void> {
  const reason = formData?.get("reason") === "timeout" ? "timeout" : "signed-out";
  const db = await createDb();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (user) await db.rpc("log_event", { p_action: "auth.logout", p_module: "access" });
  await db.auth.signOut();
  const jar = await cookies();
  jar.delete("ehris_last_active");
  jar.delete("ehris_session_start");
  redirect(`/login?reason=${reason}`);
}
