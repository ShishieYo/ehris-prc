import { NextResponse, type NextRequest } from "next/server";
import { getCtx } from "@/lib/auth/session";
import { getPds } from "@/lib/data/pds";
import { logEvent } from "@/lib/audit";
import { buildPdsPdf } from "@/lib/pds/pdf";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCtx();
  if (!ctx || !ctx.privacyOk) return new NextResponse("Unauthorized", { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });

  const [{ data: employee }, { data: priv }] = await Promise.all([
    ctx.db.from("employees").select("*").eq("id", id).maybeSingle(),
    ctx.db.from("employee_private").select("*").eq("employee_id", id).maybeSingle(),
  ]);
  const isSelf = ctx.employeeId === id;
  if (!employee || (!isSelf && !ctx.can("pds.read_all"))) return new NextResponse("Not found", { status: 404 });

  const logged = await logEvent(ctx, "pds.downloaded", "pds", { entityType: "employees", entityId: id, subjectEmployeeId: id });
  if (!logged) return new NextResponse("This file can't be generated right now.", { status: 503 });

  const bytes = await buildPdsPdf({ employee, priv: priv ?? null, pds: await getPds(ctx, id), generatedBy: ctx.displayName });
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="PDS-${employee.employee_no}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
