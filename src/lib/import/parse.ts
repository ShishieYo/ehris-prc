import "server-only";
import ExcelJS from "exceljs";
import Papa from "papaparse";

export const MAX_ROWS = 5000;
export const MAX_BYTES = 5 * 1024 * 1024;

export type ParsedSheet = { headers: string[]; rows: Record<string, string>[] };
export class ImportParseError extends Error {}

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("text" in v && typeof v.text === "string") return v.text.trim();
    if ("result" in v && v.result != null) return cellText(v.result as ExcelJS.CellValue);
    if ("richText" in v && Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("").trim();
    return "";
  }
  return String(v).trim();
}

/** Parses the first worksheet of an .xlsx file or a .csv file into header + string rows. */
export async function parseSpreadsheet(file: File): Promise<ParsedSheet> {
  if (file.size === 0) throw new ImportParseError("The file is empty.");
  if (file.size > MAX_BYTES) throw new ImportParseError("The file is larger than 5 MB.");
  const name = file.name.toLowerCase();
  let table: string[][];

  if (name.endsWith(".csv")) {
    const text = (await file.text()).replace(/^﻿/, "");
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
    if (parsed.errors.some((e) => e.type === "Quotes")) throw new ImportParseError("The CSV file is malformed (check quotation marks).");
    table = parsed.data.map((r) => r.map((c) => String(c ?? "").trim()));
  } else if (name.endsWith(".xlsx")) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load((await file.arrayBuffer()) as ArrayBuffer);
    } catch {
      throw new ImportParseError("That doesn't look like a valid .xlsx file.");
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new ImportParseError("The workbook has no worksheets.");
    table = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      table.push(values.map((v) => cellText(v as ExcelJS.CellValue)));
    });
  } else {
    throw new ImportParseError("Upload a .csv or .xlsx file.");
  }

  const [headerRow, ...body] = table.filter((r) => r.some((c) => c !== ""));
  if (!headerRow) throw new ImportParseError("No header row was found.");
  const headers = headerRow.map((h, i) => h || `Column ${i + 1}`);
  if (new Set(headers.map((h) => h.toLowerCase())).size !== headers.length) throw new ImportParseError("Column names must be unique.");
  if (body.length === 0) throw new ImportParseError("The file has a header but no data rows.");
  if (body.length > MAX_ROWS) throw new ImportParseError(`The file has more than ${MAX_ROWS} rows. Split it into smaller files.`);
  const rows = body.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
  return { headers, rows };
}
