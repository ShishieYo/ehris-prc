/** Target fields for the employee masterlist import, with header aliases used for auto-mapping. */
export type ImportField = { key: string; label: string; required?: boolean; aliases: string[] };

export const EMPLOYEE_IMPORT_FIELDS: ImportField[] = [
  { key: "employee_no", label: "Employee ID", aliases: ["employee id", "employee no", "emp no", "id no", "employee number"] },
  { key: "prc_employee_no", label: "PRC employee number", aliases: ["prc employee no", "prc no", "prc number", "prc employee number"] },
  { key: "last_name", label: "Last name", required: true, aliases: ["last name", "surname", "family name", "lastname"] },
  { key: "first_name", label: "First name", required: true, aliases: ["first name", "given name", "firstname"] },
  { key: "middle_name", label: "Middle name", aliases: ["middle name", "middlename", "mi"] },
  { key: "extension_name", label: "Extension name", aliases: ["extension", "ext", "suffix", "name extension"] },
  { key: "sex", label: "Sex", aliases: ["sex", "gender"] },
  { key: "birth_date", label: "Date of birth", aliases: ["birth date", "date of birth", "birthdate", "dob", "birthday"] },
  { key: "civil_status", label: "Civil status", aliases: ["civil status", "marital status"] },
  { key: "official_email", label: "Official email", aliases: ["official email", "email", "work email", "office email"] },
  { key: "mobile_no", label: "Mobile number", aliases: ["mobile", "mobile no", "contact number", "phone", "cellphone"] },
  { key: "tin", label: "TIN", aliases: ["tin", "tin no", "tax id"] },
  { key: "gsis_bp_no", label: "GSIS BP number", aliases: ["gsis", "gsis bp no", "gsis no", "bp number"] },
  { key: "philhealth_no", label: "PhilHealth number", aliases: ["philhealth", "philhealth no"] },
  { key: "pagibig_no", label: "Pag-IBIG number", aliases: ["pagibig", "pag-ibig", "hdmf", "pagibig no"] },
  { key: "position", label: "Position (code or title)", aliases: ["position", "position title", "designation", "item"] },
  { key: "org_unit", label: "Office / unit (code or name)", aliases: ["office", "unit", "division", "section", "assignment", "org unit"] },
  { key: "employment_status", label: "Employment status (code or name)", aliases: ["employment status", "status", "appointment status", "status of appointment"] },
  { key: "salary_grade", label: "Salary grade", aliases: ["salary grade", "sg"] },
  { key: "salary_step", label: "Step", aliases: ["step", "salary step"] },
  { key: "original_appointment_date", label: "Original appointment date", aliases: ["original appointment", "original appointment date", "date hired", "date of original appointment"] },
  { key: "current_appointment_date", label: "Current appointment date", aliases: ["current appointment", "current appointment date", "date of appointment"] },
  { key: "date_assumed", label: "Date assumed", aliases: ["date assumed", "assumption", "date of assumption"] },
  { key: "supervisor_employee_no", label: "Supervisor's employee ID", aliases: ["supervisor", "supervisor id", "immediate supervisor"] },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Suggest a mapping from detected headers to target fields (user can change it). */
export function suggestMapping(headers: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const used = new Set<string>();
  for (const f of EMPLOYEE_IMPORT_FIELDS) {
    const match = headers.find((h) => !used.has(h) && [f.label, f.key.replace(/_/g, " "), ...f.aliases].map(norm).includes(norm(h)));
    if (match) {
      out[f.key] = match;
      used.add(match);
    }
  }
  return out;
}
