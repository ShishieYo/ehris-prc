import "server-only";
import type { Ctx } from "@/lib/auth/session";
import { getLookups } from "@/lib/data/lookups";
import { listEmployeeOptions } from "@/lib/data/employees";
import type { AdminField, OptionSource } from "@/lib/admin/tables";

/** Resolve a field's option source to {value,label} pairs. */
export async function resolveOptions(ctx: Ctx, fields: AdminField[]): Promise<Record<string, { value: string; label: string }[]>> {
  const needed = new Set(fields.map((f) => f.options).filter((o): o is Exclude<OptionSource, { value: string; label: string }[]> => typeof o === "string"));
  const lookups = needed.size ? await getLookups(ctx) : null;
  const employees = needed.has("employees") ? await listEmployeeOptions(ctx) : [];
  const out: Record<string, { value: string; label: string }[]> = {};
  for (const f of fields) {
    if (!f.options) continue;
    if (Array.isArray(f.options)) out[f.name] = f.options;
    else if (f.options === "org_units") out[f.name] = lookups!.orgUnits.map((u) => ({ value: u.id, label: lookups!.orgUnitPath(u.id) }));
    else if (f.options === "positions") out[f.name] = lookups!.positions.map((p) => ({ value: p.id, label: p.title }));
    else if (f.options === "employees") out[f.name] = employees.map((e) => ({ value: e.id, label: `${e.full_name} (${e.employee_no})` }));
  }
  if (needed.has("org_unit_types")) {
    const { data } = await ctx.db.from("org_unit_types").select("code, name").order("sort_order");
    for (const f of fields) if (f.options === "org_unit_types") out[f.name] = (data ?? []).map((t) => ({ value: t.code, label: t.name }));
  }
  return out;
}
