import { z } from "zod";
import { optCode, optDate, optInt, optText, optUuid, reqText } from "./common";

const govId = z
  .string()
  .trim()
  .refine((v) => v === "" || /^[0-9-]{9,15}$/.test(v), "Use 9–15 digits (dashes allowed).")
  .transform((v) => (v === "" ? null : v));

export const coreSchema = z.object({
  employee_no: optText(40).optional(),
  prc_employee_no: optText(40),
  first_name: reqText("First name", 80),
  middle_name: optText(80),
  last_name: reqText("Last name", 80),
  extension_name: optText(20),
  sex: z.enum(["male", "female", ""]).transform((v) => v || null),
  official_email: z
    .string()
    .trim()
    .refine((v) => v === "" || z.email().safeParse(v).success, "Enter a valid email address.")
    .transform((v) => (v === "" ? null : v)),
  position_id: optUuid,
  plantilla_item_id: optUuid,
  position_number: optText(40),
  salary_grade: optInt(1, 33),
  salary_step: optInt(1, 8),
  appointment_nature_code: optCode,
  original_appointment_date: optDate,
  current_appointment_date: optDate,
  date_assumed: optDate,
  org_unit_id: optUuid,
  supervisor_employee_id: optUuid,
});

/** Only offered to users holding employee.manage_status. */
export const statusSchema = z.object({
  employment_status_code: optCode,
  record_status: z.enum(["active", "inactive", "separated"]),
  separation_date: optDate,
});

export const privateSchema = z.object({
  birth_date: optDate,
  birth_place: optText(120),
  civil_status: z.enum(["single", "married", "widowed", "separated", "annulled", "other", ""]).transform((v) => v || null),
  citizenship: optText(60),
  blood_type: z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", ""]).transform((v) => v || null),
  tin: govId,
  gsis_bp_no: govId,
  philhealth_no: govId,
  pagibig_no: govId,
  personal_email: z
    .string()
    .trim()
    .refine((v) => v === "" || z.email().safeParse(v).success, "Enter a valid email address.")
    .transform((v) => (v === "" ? null : v)),
  mobile_no: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[0-9+() -]{7,20}$/.test(v), "Enter a valid phone number.")
    .transform((v) => (v === "" ? null : v)),
});

export const contactSchema = z.object({
  personal_email: privateSchema.shape.personal_email,
  mobile_no: privateSchema.shape.mobile_no,
});

export const addressSchema = z.object({
  address_type: z.enum(["residential", "permanent"]),
  house_no: optText(60),
  street: optText(120),
  subdivision: optText(120),
  barangay: optText(120),
  city_municipality: optText(120),
  province: optText(120),
  zip_code: optText(10),
});
