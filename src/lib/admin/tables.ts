import type { Permission } from "@/lib/auth/permissions";

export type OptionSource = "org_units" | "positions" | "org_unit_types" | "employees" | { value: string; label: string }[];

export type AdminField = {
  name: string;
  label: string;
  type: "text" | "number" | "checkbox" | "select" | "textarea" | "date";
  required?: boolean;
  options?: OptionSource;
  /** Not editable once the row exists (primary keys). */
  immutable?: boolean;
  list?: boolean;
  hint?: string;
};

export type AdminTable = {
  key: string;
  table:
    | "org_units" | "positions" | "plantilla_items" | "org_unit_types" | "employment_statuses" | "appointment_natures"
    | "attendance_statuses" | "leave_types" | "document_categories" | "hr_request_types" | "pds_declaration_questions" | "holidays";
  title: string;
  description: string;
  pk: string;
  permission: Permission;
  orderBy: string;
  fields: AdminField[];
};

const ACTIVE: AdminField = { name: "is_active", label: "Active", type: "checkbox", list: true };
const SORT: AdminField = { name: "sort_order", label: "Sort order", type: "number" };

export const ADMIN_TABLES: AdminTable[] = [
  {
    key: "org-units", table: "org_units", title: "Organizational units", pk: "id", permission: "org.manage", orderBy: "name",
    description: "Regional office, divisions, sections, units and service centers. Changes apply immediately — no code change needed.",
    fields: [
      { name: "code", label: "Code", type: "text", required: true, list: true, hint: "Short unique code, e.g. LRD" },
      { name: "name", label: "Name", type: "text", required: true, list: true },
      { name: "unit_type", label: "Type", type: "select", required: true, list: true, options: "org_unit_types" },
      { name: "parent_id", label: "Reports to (parent unit)", type: "select", options: "org_units", list: true },
      { name: "head_employee_id", label: "Head of unit", type: "select", options: "employees", hint: "Heads review requests of everyone in the unit and below." },
      ACTIVE,
    ],
  },
  {
    key: "positions", table: "positions", title: "Positions", pk: "id", permission: "org.manage", orderBy: "title",
    description: "Position titles and their standard salary grade.",
    fields: [
      { name: "code", label: "Code", type: "text", required: true, list: true },
      { name: "title", label: "Position title", type: "text", required: true, list: true },
      { name: "salary_grade", label: "Salary grade", type: "number", list: true },
      ACTIVE,
    ],
  },
  {
    key: "plantilla", table: "plantilla_items", title: "Plantilla items", pk: "id", permission: "org.manage", orderBy: "item_number",
    description: "Plantilla items by position and unit. An item can have only one active incumbent.",
    fields: [
      { name: "item_number", label: "Item number", type: "text", required: true, list: true },
      { name: "position_id", label: "Position", type: "select", required: true, options: "positions", list: true },
      { name: "org_unit_id", label: "Unit", type: "select", required: true, options: "org_units", list: true },
      { name: "salary_grade", label: "Salary grade", type: "number", list: true },
      { name: "remarks", label: "Remarks", type: "text" },
      ACTIVE,
    ],
  },
  {
    key: "unit-types", table: "org_unit_types", title: "Organizational unit types", pk: "code", permission: "org.manage", orderBy: "sort_order",
    description: "The levels your structure uses (office, division, section, unit, service center…).",
    fields: [{ name: "code", label: "Code", type: "text", required: true, immutable: true, list: true }, { name: "name", label: "Name", type: "text", required: true, list: true }, { ...SORT, list: true }, ACTIVE],
  },
  {
    key: "employment-statuses", table: "employment_statuses", title: "Employment statuses", pk: "code", permission: "admin.config", orderBy: "sort_order",
    description: "Permanent, Temporary, Casual, COS, JO, … Add or rename as your agency requires.",
    fields: [{ name: "code", label: "Code", type: "text", required: true, immutable: true, list: true }, { name: "name", label: "Name", type: "text", required: true, list: true }, { name: "description", label: "Description", type: "text" }, { ...SORT, list: true }, ACTIVE],
  },
  {
    key: "appointment-natures", table: "appointment_natures", title: "Nature of appointment", pk: "code", permission: "admin.config", orderBy: "sort_order",
    description: "Original, promotion, transfer, reappointment…",
    fields: [{ name: "code", label: "Code", type: "text", required: true, immutable: true, list: true }, { name: "name", label: "Name", type: "text", required: true, list: true }, { ...SORT, list: true }, ACTIVE],
  },
  {
    key: "attendance-statuses", table: "attendance_statuses", title: "Attendance statuses", pk: "code", permission: "admin.config", orderBy: "sort_order",
    description: "Statuses shown in the DTR. 'Counts as present' feeds management attendance indicators.",
    fields: [{ name: "code", label: "Code", type: "text", required: true, immutable: true, list: true, hint: "PRESENT, LATE, MISSING_LOG, ABSENT and LEAVE are used by the system." }, { name: "name", label: "Name", type: "text", required: true, list: true }, { name: "counts_as_present", label: "Counts as present", type: "checkbox", list: true }, { ...SORT, list: true }, ACTIVE],
  },
  {
    key: "leave-types", table: "leave_types", title: "Leave types", pk: "code", permission: "admin.config", orderBy: "sort_order",
    description: "Leave types and balance rules. The system never infers legal entitlement: it only enforces what you configure here.",
    fields: [
      { name: "code", label: "Code", type: "text", required: true, immutable: true, list: true }, { name: "name", label: "Name", type: "text", required: true, list: true },
      { name: "requires_balance", label: "Block filing beyond available balance", type: "checkbox", list: true },
      { name: "deducts_balance", label: "Deduct from balance when approved", type: "checkbox", list: true },
      { ...SORT, list: true }, ACTIVE,
    ],
  },
  {
    key: "document-categories", table: "document_categories", title: "Document categories", pk: "code", permission: "admin.config", orderBy: "sort_order",
    description: "Categories in the personnel folder. 'Required' feeds document compliance reports and data quality checks.",
    fields: [
      { name: "code", label: "Code", type: "text", required: true, immutable: true, list: true }, { name: "name", label: "Name", type: "text", required: true, list: true },
      { name: "group_name", label: "Group", type: "text", required: true, list: true },
      { name: "is_required", label: "Required for every employee", type: "checkbox", list: true },
      { name: "requires_expiry", label: "Has an expiry date", type: "checkbox" }, { ...SORT, list: true }, ACTIVE,
    ],
  },
  {
    key: "request-types", table: "hr_request_types", title: "HR request types", pk: "code", permission: "admin.config", orderBy: "sort_order",
    description: "Services employees can request. A request type that 'produces a document' cannot be released until HR links the generated file.",
    fields: [
      { name: "code", label: "Code", type: "text", required: true, immutable: true, list: true }, { name: "name", label: "Name", type: "text", required: true, list: true },
      { name: "description", label: "Description", type: "text" },
      { name: "requires_attachment", label: "Requires supporting document", type: "checkbox", list: true },
      { name: "produces_document", label: "Produces a document", type: "checkbox", list: true }, { ...SORT, list: true }, ACTIVE,
    ],
  },
  {
    key: "declaration-questions", table: "pds_declaration_questions", title: "PDS declaration questions", pk: "code", permission: "admin.config", orderBy: "sort_order",
    description: "Wording must follow the current CSC Form 212 revision.",
    fields: [{ name: "code", label: "Code", type: "text", required: true, immutable: true, list: true }, { name: "label", label: "Question", type: "textarea", required: true, list: true }, { ...SORT, list: true }, ACTIVE],
  },
  {
    key: "holidays", table: "holidays", title: "Holidays", pk: "holiday_date", permission: "admin.config", orderBy: "holiday_date",
    description: "Holidays are excluded when counting leave days and shown in the DTR. No holiday list is assumed: maintain it as proclamations are issued.",
    fields: [
      { name: "holiday_date", label: "Date", type: "date", required: true, immutable: true, list: true }, { name: "name", label: "Name", type: "text", required: true, list: true },
      { name: "kind", label: "Kind", type: "select", required: true, list: true, options: [{ value: "regular", label: "Regular holiday" }, { value: "special", label: "Special non-working day" }, { value: "local", label: "Local / office" }] },
    ],
  },
];

export const adminTableByKey = (key: string) => ADMIN_TABLES.find((t) => t.key === key);
