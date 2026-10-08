"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createDb } from "@/lib/supabase/server";
import { clearAttempts, recordAttempt, tooManyAttempts } from "@/lib/auth/rate-limit";
import { safeNext } from "@/lib/auth/safe-redirect";
import type { ActionState } from "@/lib/errors";

const schema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email()), password: z.string().min(1).max(256) });

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { ok: false, error: "Enter your email address and password." };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const key = `login:${ip}:${parsed.data.email}`;
  if (tooManyAttempts(key)) {
    return { ok: false, error: "Too many sign-in attempts. Please wait 15 minutes and try again, or contact HR Support." };
  }

  const db = await createDb();
  const { error } = await db.auth.signInWithPassword(parsed.data);
  if (error) {
    recordAttempt(key);
    // Same message for unknown email and wrong password: no account enumeration.
    return { ok: false, error: "Incorrect email or password." };
  }

  const { data: access } = await db.rpc("my_access");
  if (!access) {
    await db.auth.signOut();
    return { ok: false, error: "Your account isn't active yet. Please contact HR Support." };
  }
  clearAttempts(key);
  await db.rpc("log_event", { p_action: "auth.login", p_module: "access" });

  const jar = await cookies();
  const opts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };
  const now = String(Date.now());
  jar.set("ehris_session_start", now, opts);
  jar.set("ehris_last_active", now, opts);

  redirect(safeNext(String(formData.get("next") ?? "")));
}
