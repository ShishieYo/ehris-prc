import { NextResponse, type NextRequest } from "next/server";
import { getCtx } from "@/lib/auth/session";
import { auditQuery, type AuditFilters } from "@/lib/data/audit";
import { toCsv } from "@/lib/reports/export";
import { logEvent } from "@/lib/audit";

export async function GET(request: NextRequest) {
  const ctx = await getCtx();
  if (!ctx || !ctx.privacyOk || !ctx.can("audit.read")) return new NextResponse("Not found", { status: 404 });
  const f: AuditFilters = {};
  for (const k of ["from", "to", "module", "actor", "action", "employee"] as const) {
    const v = request.nextUrl.searchParams.get(k);
    if (v) f[k] = v;
  }
  const { data, error } = await auditQuery(ctx, f).limit(10000);
  if (error) return new NextResponse("This export can't be created right now.", { status: 503 });
  if (!(await logEvent(ctx, "report.exported", "audit", { entityType: "audit_logs", metadata: { rows: data?.length ?? 0 } }))) {
    return new NextResponse("This export can't be created right now.", { status: 503 });
  }
  const rows = (data ?? []).map((r) => [r.id, r.occurred_at, r.actor_label, r.action, r.module, r.entity_type ?? "", r.entity_id ?? "", r.reason ?? "", JSON.stringify(r.old_values ?? ""), JSON.stringify(r.new_values ?? "")]);
  return new NextResponse(toCsv({ columns: ["ID", "Timestamp", "User", "Action", "Module", "Entity", "Entity ID", "Reason", "Before", "After"], rows }), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "private, no-store" },
  });
}
