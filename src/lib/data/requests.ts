import "server-only";
import { notFound } from "next/navigation";
import type { Ctx } from "@/lib/auth/session";
import type { EntityType, Row } from "@/lib/db/types";

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/** Supporting files linked to a request (visibility follows the documents RLS). */
export async function getRelatedDocuments(ctx: Ctx, type: EntityType, id: string): Promise<Row<"documents">[]> {
  const { data, error } = await ctx.db
    .from("documents")
    .select("*")
    .eq("related_entity_type", type)
    .eq("related_entity_id", id)
    .is("deleted_at", null)
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}

export async function getRequester(ctx: Ctx, employeeId: string) {
  const { data } = await ctx.db.from("employee_directory").select("id, full_name, employee_no, position_title, unit_name").eq("id", employeeId).maybeSingle();
  return data;
}

export async function getLeave(ctx: Ctx, id: string) {
  if (!isUuid(id)) notFound();
  const { data, error } = await ctx.db.from("leave_applications").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) notFound();
  return data;
}

export async function getCorrection(ctx: Ctx, id: string) {
  if (!isUuid(id)) notFound();
  const { data, error } = await ctx.db.from("attendance_corrections").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) notFound();
  return data;
}

export async function getHrRequest(ctx: Ctx, id: string) {
  if (!isUuid(id)) notFound();
  const { data, error } = await ctx.db.from("hr_requests").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) notFound();
  return data;
}
