import "server-only";
import type { Ctx } from "@/lib/auth/session";

export type AuditAction =
  | "auth.login" | "auth.logout" | "auth.password_reset_requested" | "auth.password_changed"
  | "document.viewed" | "document.downloaded" | "employee.viewed" | "employee.sensitive_viewed"
  | "pds.viewed" | "pds.downloaded" | "pds.certified" | "report.generated" | "report.exported"
  | "privacy.acknowledged" | "import.previewed";

/**
 * Records a business event (reads, downloads, sign-in) in the audit trail.
 * Row changes are audited by database triggers; this is for events a trigger
 * cannot see. Returns false when the event could not be recorded so that
 * callers who must not proceed unaudited (file downloads) can refuse.
 */
export async function logEvent(
  ctx: Ctx,
  action: AuditAction,
  module: string,
  opts: { entityType?: string; entityId?: string; subjectEmployeeId?: string; metadata?: Record<string, string | number | boolean> } = {},
): Promise<boolean> {
  const { error } = await ctx.db.rpc("log_event", {
    p_action: action,
    p_module: module,
    p_entity_type: opts.entityType,
    p_entity_id: opts.entityId,
    p_subject_employee_id: opts.subjectEmployeeId,
    p_metadata: opts.metadata ?? {},
  });
  if (error) {
    console.error(JSON.stringify({ level: "error", context: "audit", action, code: error.code, message: error.message }));
    return false;
  }
  return true;
}
