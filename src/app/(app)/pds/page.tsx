import { redirect } from "next/navigation";
import { requireCtx } from "@/lib/auth/session";

export default async function PdsIndex() {
  const ctx = await requireCtx();
  redirect(ctx.employeeId ? `/pds/${ctx.employeeId}` : "/personnel");
}
