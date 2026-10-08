"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createDb } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { recordAttempt, tooManyAttempts } from "@/lib/auth/rate-limit";
import type { ActionState } from "@/lib/errors";

export async function requestReset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.email().safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!parsed.success) return { ok: false, error: "Enter a valid email address." };

  const h = await headers();
  const key = `reset:${h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"}`;
  if (tooManyAttempts(key, 5, 60 * 60_000)) {
    return { ok: false, error: "Too many requests. Please try again later or contact HR Support." };
  }
  recordAttempt(key);

  const db = await createDb();
  const { error } = await db.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${env().APP_URL}/auth/callback?next=/reset-password`,
  });
  if (error) console.error(JSON.stringify({ level: "error", context: "password-reset", code: error.code, message: error.message }));

  // Identical response whether or not the account exists (no enumeration).
  return { ok: true, message: "If that email belongs to an account, a reset link is on its way. Check your inbox." };
}
