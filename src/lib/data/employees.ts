import "server-only";
import { notFound } from "next/navigation";
import type { Ctx } from "@/lib/auth/session";
import type { Row, ViewRow } from "@/lib/db/types";

export const PAGE_SIZE = 20;

export type SearchParams = { q?: string; division?: string; status?: string; record?: string; page?: string };

export async function searchEmployees(ctx: Ctx, p: SearchParams) {
  const page = Math.max(1, Number(p.page) || 1);
  const { data, error } = await ctx.db.rpc("search_employees", {
    p_query: p.q || undefined,
    p_division: p.division || undefined,
    p_status: p.status || undefined,
    p_record_status: p.record === "all" ? undefined : p.record || "active",
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  if (error) throw error;
  return { rows: data ?? [], total: data?.[0]?.total_count ?? 0, page };
}

/** Raw employee row; RLS returns nothing for records the caller may not see, which we treat as "not found". */
export async function getEmployee(ctx: Ctx, id: string): Promise<Row<"employees">> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data, error } = await ctx.db.from("employees").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) notFound();
  return data;
}

export async function getEmployeePrivate(ctx: Ctx, id: string): Promise<Row<"employee_private"> | null> {
  const { data, error } = await ctx.db.from("employee_private").select("*").eq("employee_id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getAddresses(ctx: Ctx, id: string): Promise<Row<"employee_addresses">[]> {
  const { data, error } = await ctx.db.from("employee_addresses").select("*").eq("employee_id", id);
  if (error) throw error;
  return data ?? [];
}

export async function getDirectoryEntry(ctx: Ctx, id: string): Promise<ViewRow<"employee_directory"> | null> {
  const { data, error } = await ctx.db.from("employee_directory").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getCompletion(ctx: Ctx, id: string) {
  const { data, error } = await ctx.db.rpc("profile_completion", { p_employee: id });
  if (error) throw error;
  return data as { percent: number; items: { label: string; done: boolean }[] };
}

export async function getChangeHistory(ctx: Ctx, id: string) {
  const { data, error } = await ctx.db.rpc("employee_change_history", { p_employee: id });
  if (error) throw error;
  return data ?? [];
}

/** Active employees for pickers (supervisor, assignment). Requires broad read access. */
export async function listEmployeeOptions(ctx: Ctx) {
  const { data, error } = await ctx.db
    .from("employee_directory")
    .select("id, employee_no, full_name")
    .eq("record_status", "active")
    .order("full_name")
    .limit(500);
  if (error) throw error;
  return (data ?? []).flatMap((e) => (e.id && e.employee_no && e.full_name ? [{ id: e.id, employee_no: e.employee_no, full_name: e.full_name }] : []));
}

export async function resolveEmployeeScope(ctx: Ctx, requested?: string): Promise<string | null> {
  return requested || ctx.employeeId;
}
