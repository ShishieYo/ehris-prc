import "server-only";
import type { Ctx } from "@/lib/auth/session";
import { todayManila } from "@/lib/format";

export type HrDashboard = {
  total: number;
  by_status: { code: string; name: string; count: number }[];
  by_division: { name: string; count: number }[];
  by_position: { name: string; count: number }[];
  attendance_today: { recorded: number; present: number; late: number; missing_log: number; absent: number; on_leave: number };
  pending: { leave: number; attendance_corrections: number; hr_requests: number; documents_for_review: number; pds_for_review: number };
};

export type ExecDashboard = {
  total: number;
  by_division: { name: string; count: number }[];
  by_status: { name: string; count: number }[];
  attendance_month: { days_recorded: number; present: number; absent: number; late: number; missing_log: number; on_leave: number };
  pending_requests: { leave: number; attendance_corrections: number; hr_requests: number };
  leave_utilization: { leave_type: string; credited: number; used: number }[];
  milestones: { name: string; years: number; date: string }[];
  movements: { type: string; count: number }[];
};

export async function getHrDashboard(ctx: Ctx): Promise<HrDashboard> {
  const { data, error } = await ctx.db.rpc("dashboard_hr");
  if (error) throw error;
  return data as unknown as HrDashboard;
}

export async function getExecDashboard(ctx: Ctx): Promise<ExecDashboard> {
  const { data, error } = await ctx.db.rpc("dashboard_executive");
  if (error) throw error;
  return data as unknown as ExecDashboard;
}

/** Everything the employee dashboard shows, in parallel. */
export async function getMyDashboard(ctx: Ctx, employeeId: string) {
  const today = todayManila();
  const year = Number(today.slice(0, 4));
  const monthStart = `${today.slice(0, 7)}-01`;
  const open = ["in_review", "approved"];
  const [directory, completion, todayRec, balances, missing, leave, corr, req, notes, nLeave, nCorr, nReq] = await Promise.all([
    ctx.db.from("employee_directory").select("*").eq("id", employeeId).maybeSingle(),
    ctx.db.rpc("profile_completion", { p_employee: employeeId }),
    ctx.db.from("attendance_records").select("*").eq("employee_id", employeeId).eq("work_date", today).maybeSingle(),
    ctx.db.from("leave_balance_summary").select("*").eq("employee_id", employeeId).eq("year", year),
    ctx.db.from("attendance_records").select("work_date").eq("employee_id", employeeId).eq("status_code", "MISSING_LOG").gte("work_date", monthStart),
    ctx.db.from("leave_applications").select("id, request_no, status, date_from, date_to, leave_type_code, created_at, workflow_code, current_step_order").eq("employee_id", employeeId).order("created_at", { ascending: false }).limit(5),
    ctx.db.from("attendance_corrections").select("id, request_no, status, work_date, correction_type, created_at, workflow_code, current_step_order").eq("employee_id", employeeId).order("created_at", { ascending: false }).limit(5),
    ctx.db.from("hr_requests").select("id, request_no, status, subject, request_type_code, created_at, workflow_code, current_step_order").eq("employee_id", employeeId).order("created_at", { ascending: false }).limit(5),
    ctx.db.from("notifications").select("*").order("created_at", { ascending: false }).limit(5),
    ctx.db.from("leave_applications").select("id", { count: "exact", head: true }).eq("employee_id", employeeId).in("status", open),
    ctx.db.from("attendance_corrections").select("id", { count: "exact", head: true }).eq("employee_id", employeeId).in("status", open),
    ctx.db.from("hr_requests").select("id", { count: "exact", head: true }).eq("employee_id", employeeId).in("status", open),
  ]);
  for (const r of [directory, completion, todayRec, balances, missing, leave, corr, req, notes, nLeave, nCorr, nReq]) if (r.error) throw r.error;
  return {
    directory: directory.data,
    completion: completion.data as unknown as { percent: number; items: { label: string; done: boolean }[] },
    today: todayRec.data,
    balances: balances.data ?? [],
    missingLogs: (missing.data ?? []).map((m) => m.work_date),
    leave: leave.data ?? [],
    corrections: corr.data ?? [],
    requests: req.data ?? [],
    notifications: notes.data ?? [],
    pendingCount: (nLeave.count ?? 0) + (nCorr.count ?? 0) + (nReq.count ?? 0),
  };
}
