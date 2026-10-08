import { NextResponse, type NextRequest } from "next/server";
import { getCtx } from "@/lib/auth/session";
import { logEvent } from "@/lib/audit";
import { BUCKET } from "@/lib/documents/upload";

/**
 * Streams a stored file to an authorized user. The bucket is private; there is
 * never a public or signed storage URL. Access is decided by RLS (the version
 * row must be visible to this user), the download is audited BEFORE any bytes
 * are returned, and responses are never cached.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCtx();
  if (!ctx || !ctx.privacyOk) return new NextResponse("Unauthorized", { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });

  const versionParam = Number(request.nextUrl.searchParams.get("v"));
  let q = ctx.db.from("document_versions").select("*").eq("document_id", id);
  q = Number.isInteger(versionParam) && versionParam > 0 ? q.eq("version_no", versionParam) : q.order("version_no", { ascending: false }).limit(1);
  const { data: rows, error } = await q;
  const version = rows?.[0];
  if (error || !version) return new NextResponse("Not found", { status: 404 });

  const download = request.nextUrl.searchParams.get("download") === "1";
  const { data: doc } = await ctx.db.from("documents").select("employee_id").eq("id", id).maybeSingle();
  const logged = await logEvent(ctx, download ? "document.downloaded" : "document.viewed", "document", {
    entityType: "documents", entityId: id, subjectEmployeeId: doc?.employee_id, metadata: { version: version.version_no },
  });
  if (!logged) return new NextResponse("This file can't be opened right now.", { status: 503 });

  const { data: blob, error: dlError } = await ctx.db.storage.from(BUCKET).download(version.storage_path);
  if (dlError || !blob) return new NextResponse("Not found", { status: 404 });

  const asciiName = version.file_name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return new NextResponse(blob.stream(), {
    headers: {
      "Content-Type": version.mime_type,
      "Content-Length": String(version.size_bytes),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(version.file_name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // Images are rendered in a sandbox; PDFs are left to the browser's built-in viewer (a sandbox CSP would disable it).
      ...(version.mime_type.startsWith("image/") ? { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" } : {}),
    },
  });
}
