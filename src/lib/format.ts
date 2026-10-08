const TZ = "Asia/Manila";

const dateFmt = new Intl.DateTimeFormat("en-PH", { timeZone: TZ, year: "numeric", month: "short", day: "numeric" });
const dateLongFmt = new Intl.DateTimeFormat("en-PH", { timeZone: TZ, year: "numeric", month: "long", day: "numeric", weekday: "long" });
const timeFmt = new Intl.DateTimeFormat("en-PH", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: true });
const monthFmt = new Intl.DateTimeFormat("en-PH", { timeZone: TZ, year: "numeric", month: "long" });

/** Plain calendar dates (YYYY-MM-DD) are parsed at UTC noon so timezone shifts never change the day. */
function asDate(v: string | Date): Date {
  if (v instanceof Date) return v;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00Z`) : new Date(v);
}

export const fmtDate = (v?: string | Date | null) => (v ? dateFmt.format(asDate(v)) : "—");
export const fmtDateLong = (v: string | Date) => dateLongFmt.format(asDate(v));
export const fmtTime = (v?: string | Date | null) => (v ? timeFmt.format(asDate(v)) : "—");
export const fmtDateTime = (v?: string | Date | null) => (v ? `${dateFmt.format(asDate(v))}, ${timeFmt.format(asDate(v))}` : "—");
export const fmtMonth = (v: string | Date) => monthFmt.format(asDate(v));

export function fmtDuration(minutes?: number | null): string {
  if (minutes == null) return "—";
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export const fmtNumber = (n?: number | null, digits = 2) =>
  n == null ? "—" : new Intl.NumberFormat("en-PH", { maximumFractionDigits: digits }).format(n);

/** Today's date in Manila as YYYY-MM-DD. */
export function todayManila(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

/** Converts a <input type="datetime-local"> value (Manila wall clock) to an ISO instant. */
export function manilaLocalToIso(value: string): string {
  return new Date(`${value}:00+08:00`).toISOString();
}

/** Formats an instant for <input type="datetime-local"> in Manila time. */
export function isoToManilaLocal(iso: string): string {
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, dateStyle: "short", timeStyle: "short" }).format(d);
  return p.replace(" ", "T");
}

export function greeting(): string {
  const h = Number(new Intl.DateTimeFormat("en-PH", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date()));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export const titleCase = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
