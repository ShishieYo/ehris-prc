"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActionCtx } from "@/lib/auth/session";
import { formObject } from "@/lib/validation/common";

export async function markRead(formData: FormData): Promise<void> {
  const ctx = await requireActionCtx();
  const id = z.uuid().safeParse(formObject(formData).id);
  if (!id.success) return;
  await ctx.db.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id.data);
  revalidatePath("/notifications");
}

export async function markAllRead(): Promise<void> {
  const ctx = await requireActionCtx();
  await ctx.db.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  revalidatePath("/notifications");
}
