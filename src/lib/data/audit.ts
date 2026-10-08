import "server-only";
import type { Ctx } from "@/lib/auth/session";

export type AuditFilters = { from?: string; to?: string; module?: string; actor?: string; action?: string; employee?: string; page?: string };
export const AUDIT_PAGE = 50;

export function auditQuery(ctx: Ctx, f: AuditFilters) {
  let q = ctx.db.from("audit_logs").select("*", { count: "exact" }).order("id", { ascending: false });
  if (f.from) q = q.gte("occurred_at", `${f.from}T00:00:00+08:00`);
  if (f.to) q = q.lte("occurred_at", `${f.to}T23:59:59+08:00`);
  if (f.module) q = q.eq("module", f.module);
  if (f.employee) q = q.eq("subject_employee_id", f.employee);
  // Free-text filters are escaped so user input can't alter the filter expression.
  const like = (v: string) => `%${v.replace(/[\\%_,()*]/g, " ").trim()}%`;
  if (f.actor) q = q.ilike("actor_label", like(f.actor));
  if (f.action) q = q.ilike("action", like(f.action));
  return q;
}
