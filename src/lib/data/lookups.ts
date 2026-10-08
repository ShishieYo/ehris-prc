import "server-only";
import { cache } from "react";
import type { Ctx } from "@/lib/auth/session";
import type { Row } from "@/lib/db/types";

export type OrgUnit = Row<"org_units">;

/** Configurable master data used by forms and to label ids. Loaded once per request. */
export const getLookups = cache(async (ctx: Ctx) => {
  const [orgUnits, positions, statuses, natures, plantilla, leaveTypes, docCategories, requestTypes, attendanceStatuses] =
    await Promise.all([
      ctx.db.from("org_units").select("*").order("name"),
      ctx.db.from("positions").select("*").order("title"),
      ctx.db.from("employment_statuses").select("*").order("sort_order"),
      ctx.db.from("appointment_natures").select("*").order("sort_order"),
      ctx.db.from("plantilla_items").select("*").order("item_number"),
      ctx.db.from("leave_types").select("*").order("sort_order"),
      ctx.db.from("document_categories").select("*").order("sort_order"),
      ctx.db.from("hr_request_types").select("*").order("sort_order"),
      ctx.db.from("attendance_statuses").select("*").order("sort_order"),
    ]);
  for (const r of [orgUnits, positions, statuses, natures, plantilla, leaveTypes, docCategories, requestTypes, attendanceStatuses]) {
    if (r.error) throw r.error;
  }
  const units = orgUnits.data ?? [];
  const byId = new Map(units.map((u) => [u.id, u]));
  const pathOf = (id: string | null): string => {
    const names: string[] = [];
    let cur = id ? byId.get(id) : undefined;
    while (cur) {
      names.unshift(cur.name);
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
    return names.join(" › ");
  };
  return {
    orgUnits: units,
    orgUnitPath: pathOf,
    divisions: units.filter((u) => u.unit_type === "division"),
    positions: positions.data ?? [],
    employmentStatuses: statuses.data ?? [],
    appointmentNatures: natures.data ?? [],
    plantilla: plantilla.data ?? [],
    leaveTypes: leaveTypes.data ?? [],
    documentCategories: docCategories.data ?? [],
    requestTypes: requestTypes.data ?? [],
    attendanceStatuses: attendanceStatuses.data ?? [],
    positionTitle: (id: string | null) => positions.data?.find((p) => p.id === id)?.title ?? null,
    statusName: (code: string | null) => statuses.data?.find((s) => s.code === code)?.name ?? null,
    natureName: (code: string | null) => natures.data?.find((s) => s.code === code)?.name ?? null,
  };
});

export type Lookups = Awaited<ReturnType<typeof getLookups>>;
