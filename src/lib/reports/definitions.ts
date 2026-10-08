import "server-only";
import type { Ctx } from "@/lib/auth/session";
import { fmtDate, fmtDateTime, fmtNumber, titleCase, todayManila } from "@/lib/format";

export type ReportFilters = { from?: string; to?: string; year?: string; division?: string; status?: string; record?: string; employee?: string };
export type ReportResult = { columns: string[]; rows: (string | number)[][] };
type FilterKey = keyof ReportFilters;

export type ReportDef = {
  key: string;
  title: string;
  description: string;
  filters: FilterKey[];
  /** Extra permission on top of report.view (when the underlying data needs it). */
  extraPermission?: Parameters<Ctx["can"]>[0];
  run: (ctx: Ctx, f: ReportFilters) => Promise<ReportResult>;
};

const s = (v: unknown) => (v == null ? "" : String(v));
const monthStart = () => `${todayManila().slice(0, 7)}-01`;
export const defaultFilters = (): ReportFilters => ({ from: monthStart(), to: todayManila(), year: todayManila().slice(0, 4) });

function must<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw r.error;
  return (r.data ?? []) as T;
}

export const REPORTS: ReportDef[] = [
  {
    key: "masterlist", title: "Personnel masterlist", description: "All personnel with position, status and assignment.",
    filters: ["division", "status", "record"],
    async run(ctx, f) {
      let q = ctx.db.from("employee_directory").select("*").order("full_name").limit(5000);
      if (f.division) q = q.eq("division_id", f.division);
      if (f.status) q = q.eq("employment_status_code", f.status);
      if ((f.record ?? "active") !== "all") q = q.eq("record_status", f.record ?? "active");
      const rows = must(await q);
      return {
        columns: ["Employee ID", "Name", "Position", "SG-Step", "Employment status", "Division", "Unit", "Record status"],
        rows: rows.map((r) => [s(r.employee_no), s(r.full_name), s(r.position_title), r.salary_grade ? `${r.salary_grade}${r.salary_step ? `-${r.salary_step}` : ""}` : "", s(r.employment_status_name), s(r.division_name), s(r.unit_name), titleCase(s(r.record_status))]),
      };
    },
  },
  {
    key: "by-division", title: "Personnel by division", description: "Headcount per division.", filters: ["record"],
    async run(ctx, f) {
      const rows = must(await ctx.db.from("employee_directory").select("division_name, record_status").limit(10000));
      const keep = rows.filter((r) => (f.record ?? "active") === "all" || r.record_status === (f.record ?? "active"));
      const counts = new Map<string, number>();
      for (const r of keep) counts.set(r.division_name ?? "Not under a division", (counts.get(r.division_name ?? "Not under a division") ?? 0) + 1);
      const out = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      return { columns: ["Division", "Headcount"], rows: [...out, ["Total", out.reduce((t, [, n]) => t + n, 0)]] };
    },
  },
  {
    key: "by-status", title: "Personnel by employment status", description: "Headcount per employment status.", filters: ["record"],
    async run(ctx, f) {
      const rows = must(await ctx.db.from("employee_directory").select("employment_status_name, record_status").limit(10000));
      const keep = rows.filter((r) => (f.record ?? "active") === "all" || r.record_status === (f.record ?? "active"));
      const counts = new Map<string, number>();
      for (const r of keep) counts.set(r.employment_status_name ?? "Unassigned", (counts.get(r.employment_status_name ?? "Unassigned") ?? 0) + 1);
      const out = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      return { columns: ["Employment status", "Headcount"], rows: [...out, ["Total", out.reduce((t, [, n]) => t + n, 0)]] };
    },
  },
  {
    key: "plantilla", title: "Plantilla / position summary", description: "Plantilla items with incumbents and vacancies.", filters: [],
    async run(ctx) {
      const rows = must(await ctx.db.rpc("report_plantilla_summary"));
      return { columns: ["Item no.", "Position", "SG", "Unit", "Incumbent", "Employment status"], rows: rows.map((r) => [r.item_number, r.position_title, s(r.salary_grade), r.unit_name, r.incumbent, s(r.employment_status)]) };
    },
  },
  {
    key: "service-record", title: "Service record (by employee)", description: "Service record entries for one employee. Enter the employee ID.", filters: ["employee"], extraPermission: "service_record.read_all",
    async run(ctx, f) {
      if (!f.employee) return { columns: ["Choose an employee"], rows: [] };
      const emp = must(await ctx.db.from("employees").select("id").eq("employee_no", f.employee.trim()).limit(1));
      if (!emp[0]) return { columns: ["Employee not found"], rows: [] };
      const rows = must(await ctx.db.from("service_records").select("*").eq("employee_id", emp[0].id).order("date_from"));
      return {
        columns: ["From", "To", "Position", "Status", "Office", "Salary", "SG-Step", "LWOP days", "Movement"],
        rows: rows.map((r) => [fmtDate(r.date_from), r.date_to ? fmtDate(r.date_to) : "Present", r.position_title, s(r.appointment_status), s(r.office), r.monthly_salary != null ? fmtNumber(r.monthly_salary) : "", r.salary_grade ? `${r.salary_grade}${r.salary_step ? `-${r.salary_step}` : ""}` : "", r.lwop_days, titleCase(r.record_type)]),
      };
    },
  },
  {
    key: "leave-summary", title: "Leave summary", description: "Leave balances per employee and leave type.", filters: ["year", "division"],
    async run(ctx, f) {
      const rows = must(await ctx.db.rpc("report_leave_summary", { p_year: Number(f.year) || Number(todayManila().slice(0, 4)), p_division: f.division || null }));
      return { columns: ["Employee ID", "Name", "Division", "Leave type", "Beginning", "Earned", "Used", "Pending", "Available"], rows: rows.map((r) => [r.employee_no, r.full_name, s(r.division_name), r.leave_type, r.beginning, r.earned, r.used, r.pending, r.available]) };
    },
  },
  {
    key: "attendance-summary", title: "Attendance summary", description: "Attendance status counts and hours per employee for a date range.", filters: ["from", "to", "division"],
    async run(ctx, f) {
      const d = defaultFilters();
      const rows = must(await ctx.db.rpc("report_attendance_summary", { p_from: f.from || d.from!, p_to: f.to || d.to!, p_division: f.division || null }));
      return { columns: ["Employee ID", "Name", "Division", "Present", "Late", "Undertime", "Absent", "Missing log", "On leave", "Other", "Hours"], rows: rows.map((r) => [r.employee_no, r.full_name, s(r.division_name), r.present, r.late, r.undertime, r.absent, r.missing_log, r.on_leave, r.other, r.total_hours]) };
    },
  },
  {
    key: "hr-requests", title: "HR requests", description: "Requests filed in a date range, with turnaround time.", filters: ["from", "to"],
    async run(ctx, f) {
      const d = defaultFilters();
      const rows = must(await ctx.db.rpc("report_hr_requests", { p_from: f.from || d.from!, p_to: f.to || d.to! }));
      return { columns: ["Request no.", "Type", "Requester", "Priority", "Status", "Submitted", "Completed", "Days open"], rows: rows.map((r) => [r.request_no, r.request_type, r.requester, r.priority, titleCase(r.status), fmtDateTime(r.submitted_at), r.completed_at ? fmtDateTime(r.completed_at) : "", r.days_open]) };
    },
  },
  {
    key: "movement", title: "Personnel movement", description: "Appointments, promotions, transfers and separations in a date range.", filters: ["from", "to"], extraPermission: "service_record.read_all",
    async run(ctx, f) {
      const d = defaultFilters();
      const rows = must(await ctx.db.rpc("report_personnel_movement", { p_from: f.from || d.from!, p_to: f.to || d.to! }));
      return { columns: ["Employee ID", "Name", "Division", "Movement", "Position", "Status", "Effective", "Remarks"], rows: rows.map((r) => [r.employee_no, r.full_name, s(r.division_name), titleCase(r.record_type), r.position_title, s(r.appointment_status), fmtDate(r.effective_date), s(r.remarks)]) };
    },
  },
  {
    key: "document-compliance", title: "Document compliance", description: "Required document categories: complete, missing, expired or awaiting review.", filters: [],
    async run(ctx) {
      const rows = must(await ctx.db.rpc("report_document_compliance"));
      return { columns: ["Employee ID", "Name", "Division", "Required document", "Status"], rows: rows.map((r) => [r.employee_no, r.full_name, s(r.division_name), r.category, r.compliance]) };
    },
  },
  {
    key: "training", title: "Training / learning summary", description: "Learning and development entries from PDS records in a date range.", filters: ["from", "to"], extraPermission: "pds.read_all",
    async run(ctx, f) {
      const d = defaultFilters();
      const from = f.from || `${todayManila().slice(0, 4)}-01-01`;
      const rows = must(await ctx.db.rpc("report_training_summary", { p_from: from, p_to: f.to || d.to! }));
      return { columns: ["Employee ID", "Name", "Division", "Trainings", "Total hours"], rows: rows.map((r) => [r.employee_no, r.full_name, s(r.division_name), r.trainings, r.total_hours]) };
    },
  },
];

export const reportByKey = (key: string) => REPORTS.find((r) => r.key === key);
export const availableReports = (ctx: Ctx) => REPORTS.filter((r) => ctx.can("report.view") && (!r.extraPermission || ctx.can(r.extraPermission)));
