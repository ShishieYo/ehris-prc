import { NextResponse, type NextRequest } from "next/server";
import { getCtx } from "@/lib/auth/session";
import { availableReports, defaultFilters, reportByKey, type ReportFilters } from "@/lib/reports/definitions";
import { toCsv, toPdf, toXlsx } from "@/lib/reports/export";
import { logEvent } from "@/lib/audit";

const TYPES = {
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"],
  pdf: ["application/pdf", "pdf"],
  csv: ["text/csv; charset=utf-8", "csv"],
} as const;

export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const ctx = await getCtx();
  if (!ctx || !ctx.privacyOk) return new NextResponse("Unauthorized", { status: 401 });
  const def = reportByKey(key);
  if (!def || !availableReports(ctx).some((r) => r.key === key)) return new NextResponse("Not found", { status: 404 });

  const format = request.nextUrl.searchParams.get("format") as keyof typeof TYPES | null;
  if (!format || !(format in TYPES)) return new NextResponse("Unsupported format", { status: 400 });

  const filters = { ...defaultFilters() } as ReportFilters;
  for (const k of ["from", "to", "year", "division", "status", "record", "employee"] as const) {
    const v = request.nextUrl.searchParams.get(k);
    if (v) filters[k] = v;
  }
  const result = await def.run(ctx, filters);

  // Exports leave the system: record them before returning anything.
  const logged = await logEvent(ctx, "report.exported", "report", { entityType: "report", entityId: key, metadata: { format, rows: result.rows.length } });
  if (!logged) return new NextResponse("This export can't be created right now.", { status: 503 });

  const meta = { generatedBy: ctx.displayName };
  const body: BodyInit =
    format === "csv" ? toCsv(result)
    : format === "xlsx" ? new Uint8Array(await toXlsx(def.title, result, meta))
    : new Uint8Array(await toPdf(def.title, def.description, result, meta));
  return new NextResponse(body, {
    headers: {
      "Content-Type": TYPES[format][0],
      "Content-Disposition": `attachment; filename="${key}-${new Date().toISOString().slice(0, 10)}.${TYPES[format][1]}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
