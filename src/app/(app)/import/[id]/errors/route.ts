import { NextResponse, type NextRequest } from "next/server";
import { getCtx } from "@/lib/auth/session";
import { toCsv } from "@/lib/reports/export";
import { isUuid } from "@/lib/data/requests";

/** Error report for an import: one line per problem, so the spreadsheet can be corrected and re-uploaded. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCtx();
  if (!ctx || !ctx.privacyOk || !ctx.can("import.run") || !isUuid(id)) return new NextResponse("Not found", { status: 404 });
  const { data } = await ctx.db.from("import_rows").select("row_no, status, errors, result").eq("batch_id", id).in("status", ["error", "import_failed"]).order("row_no");
  const rows: (string | number)[][] = [];
  for (const r of data ?? []) {
    if (r.status === "import_failed") rows.push([r.row_no, "(database)", r.result ?? "Rejected by the database"]);
    for (const i of (r.errors as { field: string; message: string }[]) ?? []) rows.push([r.row_no, i.field, i.message]);
  }
  return new NextResponse(toCsv({ columns: ["Spreadsheet row", "Field", "Problem"], rows }), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="import-errors-${id.slice(0, 8)}.csv"`, "Cache-Control": "private, no-store" },
  });
}
