import "server-only";
import { randomUUID } from "node:crypto";

export const GENERIC_ERROR =
  "We couldn't complete this request. Please try again or contact HR Support.";

export type DbError = { code?: string; message?: string; hint?: string | null; details?: string | null };

/**
 * Turns a database/API error into a message that is safe to show. Messages the
 * database raised on purpose carry hint = 'user' (see migrations); everything
 * else is logged with a reference and replaced by a friendly generic message.
 */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  employee_private_tin_uq: "This TIN is already recorded for another employee.",
  employee_private_gsis_uq: "This GSIS BP number is already recorded for another employee.",
  employee_private_philhealth_uq: "This PhilHealth number is already recorded for another employee.",
  employee_private_pagibig_uq: "This Pag-IBIG number is already recorded for another employee.",
  employees_employee_no_key: "That employee ID is already in use.",
  employees_prc_employee_no_key: "That PRC employee number is already in use.",
  employees_plantilla_active_uq: "That plantilla item already has an active incumbent.",
  service_records_no_overlap: "These dates overlap another service record entry for this employee.",
  attendance_corrections_open_uq: "There is already an open correction for that date and type.",
  org_units_code_key: "That code is already used by another unit.",
  positions_code_key: "That position code is already in use.",
  plantilla_items_item_number_key: "That plantilla item number is already in use.",
};

export function toUserMessage(error: DbError | Error | unknown, context = "action"): string {
  const e = (error ?? {}) as DbError;
  if (e.hint === "user" && e.message) return e.message;
  const named = Object.keys(CONSTRAINT_MESSAGES).find((c) => e.message?.includes(`"${c}"`));
  if (named) return CONSTRAINT_MESSAGES[named];

  const ref = randomUUID().slice(0, 8);
  // Technical details stay in the server log only.
  console.error(JSON.stringify({ level: "error", ref, context, code: e.code, message: e.message, details: e.details }));

  switch (e.code) {
    case "42501":
      return `You don't have permission to do this. (Ref ${ref})`;
    case "23505":
      return `A record with these details already exists. (Ref ${ref})`;
    case "23514":
    case "22P02":
    case "22007":
    case "22008":
    case "22001":
      return `Some of the information provided isn't valid. Please review it and try again. (Ref ${ref})`;
    case "23503":
      return `This item is linked to other records and can't be changed this way. (Ref ${ref})`;
    case "23P01":
      return `These details conflict with an existing record. (Ref ${ref})`;
    default:
      return `${GENERIC_ERROR} (Ref ${ref})`;
  }
}

/** Result type used by every server action. */
export type ActionState =
  | { ok: true; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; values?: Record<string, string> }
  | null;

export const fail = (error: unknown, context?: string): ActionState & { ok: false } => ({
  ok: false,
  error: toUserMessage(error, context),
});

export function fieldErrorsFrom(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const key = String(i.path[0] ?? "form");
    out[key] ??= i.message;
  }
  return out;
}
