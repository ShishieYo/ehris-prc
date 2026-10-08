import { redirect } from "next/navigation";
import { requireCtx } from "@/lib/auth/session";

export default async function ServiceRecordIndex() {
  const ctx = await requireCtx();
  redirect(ctx.employeeId ? `/service-record/${ctx.employeeId}` : "/personnel");
}
