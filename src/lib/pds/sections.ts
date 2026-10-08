import { z } from "zod";
import { optDate, optInt, optNumber, optText, reqDate, reqText } from "@/lib/validation/common";

export type FieldDef = {
  name: string;
  label: string;
  type: "text" | "textarea" | "date" | "year" | "number" | "select";
  required?: boolean;
  options?: { value: string; label: string }[];
  hint?: string;
  /** Shown as a column in the list view. */
  list?: boolean;
};

export type SectionDef = {
  key: string;
  table:
    | "employee_family" | "employee_education" | "employee_eligibility" | "employee_work_experience"
    | "employee_voluntary_work" | "employee_training" | "employee_other_info" | "employee_references" | "employee_gov_ids";
  title: string;
  description?: string;
  fields: FieldDef[];
  maxRows?: number;
};

const opt = (values: string[]) => values.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }));

export const PDS_SECTIONS: SectionDef[] = [
  {
    key: "family", table: "employee_family", title: "Family background",
    description: "Spouse, father, mother and children.",
    fields: [
      { name: "relation", label: "Relationship", type: "select", required: true, list: true, options: opt(["spouse", "father", "mother", "child"]) },
      { name: "last_name", label: "Last name", type: "text", required: true, list: true },
      { name: "first_name", label: "First name", type: "text", required: true, list: true },
      { name: "middle_name", label: "Middle name", type: "text" },
      { name: "extension_name", label: "Extension name", type: "text" },
      { name: "birth_date", label: "Date of birth", type: "date", list: true },
      { name: "occupation", label: "Occupation", type: "text", list: true },
      { name: "employer", label: "Employer / business name", type: "text" },
      { name: "business_address", label: "Business address", type: "text" },
      { name: "telephone", label: "Telephone", type: "text" },
    ],
  },
  {
    key: "education", table: "employee_education", title: "Educational background",
    fields: [
      { name: "level", label: "Level", type: "select", required: true, list: true, options: opt(["elementary", "secondary", "vocational", "college", "graduate"]) },
      { name: "school", label: "School", type: "text", required: true, list: true },
      { name: "degree_course", label: "Degree / course", type: "text", list: true },
      { name: "period_from", label: "From (year)", type: "year", list: true },
      { name: "period_to", label: "To (year)", type: "year", list: true },
      { name: "highest_level_units", label: "Highest level / units earned", type: "text" },
      { name: "year_graduated", label: "Year graduated", type: "year", list: true },
      { name: "honors", label: "Scholarship / honors", type: "text" },
    ],
  },
  {
    key: "eligibility", table: "employee_eligibility", title: "Civil service eligibility",
    fields: [
      { name: "eligibility", label: "Eligibility / license", type: "text", required: true, list: true },
      { name: "rating", label: "Rating", type: "number", list: true },
      { name: "exam_date", label: "Date of examination", type: "date", list: true },
      { name: "exam_place", label: "Place of examination", type: "text" },
      { name: "license_number", label: "License number", type: "text", list: true },
      { name: "license_validity", label: "License validity", type: "date" },
    ],
  },
  {
    key: "work", table: "employee_work_experience", title: "Work experience",
    fields: [
      { name: "date_from", label: "From", type: "date", required: true, list: true },
      { name: "date_to", label: "To", type: "date", list: true, hint: "Leave blank if present." },
      { name: "position_title", label: "Position title", type: "text", required: true, list: true },
      { name: "agency", label: "Department / agency / company", type: "text", required: true, list: true },
      { name: "monthly_salary", label: "Monthly salary", type: "number" },
      { name: "salary_grade_step", label: "Salary grade & step", type: "text" },
      { name: "appointment_status", label: "Status of appointment", type: "text", list: true },
    ],
  },
  {
    key: "voluntary", table: "employee_voluntary_work", title: "Voluntary work",
    fields: [
      { name: "organization", label: "Organization name & address", type: "text", required: true, list: true },
      { name: "date_from", label: "From", type: "date", list: true },
      { name: "date_to", label: "To", type: "date", list: true },
      { name: "hours", label: "Number of hours", type: "number", list: true },
      { name: "nature_of_work", label: "Nature of work", type: "text", list: true },
    ],
  },
  {
    key: "training", table: "employee_training", title: "Learning and development",
    fields: [
      { name: "title", label: "Title of program", type: "text", required: true, list: true },
      { name: "date_from", label: "From", type: "date", list: true },
      { name: "date_to", label: "To", type: "date", list: true },
      { name: "hours", label: "Number of hours", type: "number", list: true },
      { name: "training_type", label: "Type (managerial / supervisory / technical…)", type: "text" },
      { name: "conducted_by", label: "Conducted / sponsored by", type: "text", list: true },
    ],
  },
  {
    key: "other", table: "employee_other_info", title: "Other information",
    description: "Special skills and hobbies, non-academic distinctions, memberships.",
    fields: [
      { name: "category", label: "Category", type: "select", required: true, list: true, options: [{ value: "skill", label: "Special skill / hobby" }, { value: "recognition", label: "Non-academic distinction / recognition" }, { value: "membership", label: "Membership in association / organization" }] },
      { name: "description", label: "Description", type: "text", required: true, list: true },
    ],
  },
  {
    key: "references", table: "employee_references", title: "References", description: "Three (3) character references who are not related to you.", maxRows: 3,
    fields: [
      { name: "name", label: "Name", type: "text", required: true, list: true },
      { name: "address", label: "Address", type: "text", list: true },
      { name: "telephone", label: "Telephone", type: "text", list: true },
    ],
  },
  {
    key: "ids", table: "employee_gov_ids", title: "Government-issued identification",
    fields: [
      { name: "id_type", label: "ID type", type: "text", required: true, list: true },
      { name: "id_number", label: "ID number", type: "text", required: true, list: true },
      { name: "issued_at", label: "Place of issuance", type: "text", list: true },
      { name: "issued_on", label: "Date of issuance", type: "date", list: true },
    ],
  },
];

export const sectionByKey = (key: string) => PDS_SECTIONS.find((s) => s.key === key);

/** Builds the validation schema for a section's form from its field definitions. */
export function schemaFor(def: SectionDef) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of def.fields) {
    switch (f.type) {
      case "date":
        shape[f.name] = f.required ? reqDate(f.label) : optDate;
        break;
      case "year":
        shape[f.name] = optInt(1900, 2100);
        break;
      case "number":
        shape[f.name] = optNumber(0, 100_000_000);
        break;
      case "select": {
        const values = (f.options ?? []).map((o) => o.value);
        shape[f.name] = z.string().refine((v) => values.includes(v), `Choose ${f.label.toLowerCase()}.`);
        break;
      }
      default:
        shape[f.name] = f.required ? reqText(f.label, 300) : optText(300);
    }
  }
  return z.object(shape).superRefine((v, ctx) => {
    const r = v as Record<string, unknown>;
    const pairs: [string, string][] = [["period_from", "period_to"], ["date_from", "date_to"]];
    for (const [a, b] of pairs) {
      if (r[a] != null && r[b] != null && String(r[b]) < String(r[a])) {
        ctx.addIssue({ code: "custom", path: [b], message: "Cannot be earlier than the start." });
      }
    }
  });
}
