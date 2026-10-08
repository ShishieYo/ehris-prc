import "server-only";
import type { Ctx } from "@/lib/auth/session";

export const ymOf = (date: string) => date.slice(0, 7);

export function monthBounds(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${ym}-01`, end: `${ym}-${String(last).padStart(2, "0")}`, days: last };
}

export const shiftMonth = (ym: string, delta: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export async function getMonthRecords(ctx: Ctx, employeeId: string, ym: string) {
  const { start, end } = monthBounds(ym);
  const [records, holidays] = await Promise.all([
    ctx.db.from("attendance_records").select("*").eq("employee_id", employeeId).gte("work_date", start).lte("work_date", end).order("work_date"),
    ctx.db.from("holidays").select("*").gte("holiday_date", start).lte("holiday_date", end),
  ]);
  if (records.error) throw records.error;
  if (holidays.error) throw holidays.error;
  return { records: records.data ?? [], holidays: holidays.data ?? [] };
}

export async function getTeamDay(ctx: Ctx, date: string) {
  const [records, people] = await Promise.all([
    ctx.db.from("attendance_records").select("*").eq("work_date", date),
    ctx.db.from("employee_directory").select("id, employee_no, full_name, unit_name, division_name").eq("record_status", "active").order("full_name").limit(1000),
  ]);
  if (records.error) throw records.error;
  if (people.error) throw people.error;
  return { records: records.data ?? [], people: people.data ?? [] };
}

export async function listCorrections(ctx: Ctx, employeeId: string | null) {
  let q = ctx.db.from("attendance_corrections").select("*").order("created_at", { ascending: false }).limit(100);
  if (employeeId) q = q.eq("employee_id", employeeId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
