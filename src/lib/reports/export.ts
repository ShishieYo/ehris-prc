import "server-only";
import ExcelJS from "exceljs";
import { PdfReport } from "./pdf";
import type { ReportResult } from "./definitions";
import { fmtDateTime } from "@/lib/format";

/** Neutralize spreadsheet formula injection: cells that begin with = + - @ are prefixed with an apostrophe. */
const safeCell = (v: string | number): string | number =>
  typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;

export function toCsv(result: ReportResult): string {
  const esc = (v: string | number) => {
    const t = String(safeCell(v));
    return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return "﻿" + [result.columns, ...result.rows].map((r) => r.map(esc).join(",")).join("\r\n");
}

export async function toXlsx(title: string, result: ReportResult, meta: { generatedBy: string }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PRC Region III eHRIS";
  wb.created = new Date();
  const ws = wb.addWorksheet(title.slice(0, 31).replace(/[\\/?*[\]:]/g, " "));
  ws.addRow([title]).font = { bold: true, size: 14 };
  ws.addRow([`Generated ${fmtDateTime(new Date())} by ${meta.generatedBy} — CONFIDENTIAL`]).font = { italic: true, size: 9 };
  ws.addRow([]);
  const header = ws.addRow(result.columns);
  header.font = { bold: true };
  header.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E7F6" } }; });
  for (const row of result.rows) ws.addRow(row.map((c) => (typeof c === "string" ? String(safeCell(c)) : c)));
  result.columns.forEach((_, i) => {
    const widths = [result.columns[i], ...result.rows.map((r) => String(r[i] ?? ""))].map((x) => x.length);
    ws.getColumn(i + 1).width = Math.min(50, Math.max(10, Math.max(...widths) + 2));
  });
  ws.views = [{ state: "frozen", ySplit: 4 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function toPdf(title: string, description: string, result: ReportResult, meta: { generatedBy: string }): Promise<Uint8Array> {
  const r = await PdfReport.create({
    title, subtitle: description, orientation: result.columns.length > 6 ? "landscape" : "portrait",
    footer: `PRC Region III eHRIS · CONFIDENTIAL · Generated ${fmtDateTime(new Date())} by ${meta.generatedBy}`,
  });
  r.table(result.columns, result.rows);
  return r.save();
}
