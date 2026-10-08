import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

type Orientation = "portrait" | "landscape";
const SIZES = { portrait: [595.28, 841.89], landscape: [841.89, 595.28] } as const;
const MARGIN = 40;
const INK = rgb(0.12, 0.16, 0.23);
const BRAND = rgb(0.08, 0.2, 0.38);
const LINE = rgb(0.82, 0.86, 0.9);

/** Standard PDF fonts only cover Latin-1; anything else is replaced so generation never fails on a stray character. */
const clean = (s: unknown) =>
  String(s ?? "").replace(/\s+/g, " ").replace(/[^\x20-\x7E -ÿ]/g, "?").trim();

/**
 * Small, dependency-light PDF writer for HR documents and reports:
 * headings, key/value blocks and auto-paginating tables, with a confidential footer.
 */
export class PdfReport {
  private pages: PDFPage[] = [];
  private y = 0;

  private constructor(
    private doc: PDFDocument,
    private font: PDFFont,
    private bold: PDFFont,
    private orientation: Orientation,
    private footerText: string,
  ) {}

  static async create(opts: { title: string; subtitle?: string; footer: string; orientation?: Orientation }) {
    const doc = await PDFDocument.create();
    doc.setTitle(opts.title);
    doc.setProducer("PRC Region III eHRIS");
    const r = new PdfReport(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold), opts.orientation ?? "portrait", opts.footer);
    r.newPage();
    r.write(opts.title, { size: 16, bold: true, color: BRAND });
    if (opts.subtitle) r.write(opts.subtitle, { size: 9, color: rgb(0.35, 0.4, 0.47) });
    r.y -= 6;
    return r;
  }

  private get width() {
    return SIZES[this.orientation][0] - MARGIN * 2;
  }

  private newPage() {
    const page = this.doc.addPage([...SIZES[this.orientation]]);
    this.pages.push(page);
    this.y = page.getHeight() - MARGIN;
  }

  private ensure(height: number) {
    if (this.y - height < MARGIN + 18) this.newPage();
  }

  private wrap(text: string, size: number, maxWidth: number, font = this.font): string[] {
    const words = clean(text).split(" ");
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) line = next;
      else {
        if (line) lines.push(line);
        // very long token: hard-split
        let rest = w;
        while (font.widthOfTextAtSize(rest, size) > maxWidth && rest.length > 1) {
          let n = rest.length;
          while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > maxWidth) n--;
          lines.push(rest.slice(0, n));
          rest = rest.slice(n);
        }
        line = rest;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  }

  write(text: string, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {}) {
    const size = o.size ?? 10;
    for (const l of this.wrap(text, size, this.width, o.bold ? this.bold : this.font)) {
      this.ensure(size + 4);
      this.pages.at(-1)!.drawText(l, { x: MARGIN, y: this.y - size, size, font: o.bold ? this.bold : this.font, color: o.color ?? INK });
      this.y -= size + 4;
    }
  }

  heading(text: string) {
    this.y -= 8;
    this.ensure(30);
    this.write(text, { size: 12, bold: true, color: BRAND });
    this.pages.at(-1)!.drawLine({ start: { x: MARGIN, y: this.y + 1 }, end: { x: MARGIN + this.width, y: this.y + 1 }, thickness: 0.7, color: LINE });
    this.y -= 4;
  }

  keyValues(pairs: [string, unknown][], columns = 2) {
    const colW = this.width / columns;
    for (let i = 0; i < pairs.length; i += columns) {
      const chunk = pairs.slice(i, i + columns);
      const cells = chunk.map(([k, v]) => ({ k: clean(k), lines: this.wrap(clean(v) || "-", 9, colW - 8) }));
      const h = 10 + Math.max(...cells.map((c) => c.lines.length)) * 12;
      this.ensure(h);
      const page = this.pages.at(-1)!;
      cells.forEach((c, idx) => {
        const x = MARGIN + idx * colW;
        page.drawText(c.k.toUpperCase(), { x, y: this.y - 8, size: 7, font: this.bold, color: rgb(0.42, 0.47, 0.55) });
        c.lines.forEach((l, li) => page.drawText(l, { x, y: this.y - 19 - li * 12, size: 9, font: this.font, color: INK }));
      });
      this.y -= h;
    }
  }

  table(headers: string[], rows: unknown[][], weights?: number[]) {
    if (rows.length === 0) {
      this.write("No entries.", { size: 9, color: rgb(0.45, 0.5, 0.57) });
      return;
    }
    const w = weights ?? headers.map(() => 1);
    const total = w.reduce((a, b) => a + b, 0);
    const colW = w.map((x) => (x / total) * this.width);
    const size = 8;
    const drawHeader = () => {
      this.ensure(22);
      const page = this.pages.at(-1)!;
      page.drawRectangle({ x: MARGIN, y: this.y - 16, width: this.width, height: 16, color: rgb(0.93, 0.95, 0.98) });
      let x = MARGIN;
      headers.forEach((h, i) => {
        page.drawText(clean(h), { x: x + 3, y: this.y - 12, size, font: this.bold, color: BRAND });
        x += colW[i];
      });
      this.y -= 18;
    };
    drawHeader();
    for (const row of rows) {
      const cells = row.map((c, i) => this.wrap(clean(c) || "-", size, colW[i] - 6));
      const h = Math.max(...cells.map((c) => c.length)) * 10 + 4;
      if (this.y - h < MARGIN + 18) {
        this.newPage();
        drawHeader();
      }
      const page = this.pages.at(-1)!;
      let x = MARGIN;
      cells.forEach((lines, i) => {
        lines.forEach((l, li) => page.drawText(l, { x: x + 3, y: this.y - 9 - li * 10, size, font: this.font, color: INK }));
        x += colW[i];
      });
      this.y -= h;
      page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: MARGIN + this.width, y: this.y }, thickness: 0.4, color: LINE });
    }
    this.y -= 4;
  }

  async save(): Promise<Uint8Array> {
    const n = this.pages.length;
    this.pages.forEach((p, i) => {
      p.drawText(clean(this.footerText), { x: MARGIN, y: 24, size: 7, font: this.font, color: rgb(0.45, 0.5, 0.57) });
      const label = `Page ${i + 1} of ${n}`;
      p.drawText(label, { x: p.getWidth() - MARGIN - this.font.widthOfTextAtSize(label, 7), y: 24, size: 7, font: this.font, color: rgb(0.45, 0.5, 0.57) });
    });
    return this.doc.save();
  }
}
