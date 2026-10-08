/**
 * Row validation for the employee import. Pure functions (no I/O) so the rules
 * are easy to test: duplicates, invalid/impossible dates, government ID
 * formats, unknown references and required fields.
 */
export type RefData = {
  positions: { id: string; code: string; title: string }[];
  orgUnits: { id: string; code: string; name: string }[];
  statuses: { code: string; name: string }[];
  /** Existing identifiers in the database (for duplicate detection). */
  existing: { employeeNos: Set<string>; prcNos: Set<string>; tins: Set<string>; gsis: Set<string>; philhealth: Set<string>; pagibig: Set<string>; nameDob: Set<string>; supervisorIdsByNo: Map<string, string> };
};

export type RowIssue = { field: string; message: string };
export type NormalizedRow = { core: Record<string, unknown>; private: Record<string, unknown> };
export type RowResult = { rowNo: number; issues: RowIssue[]; normalized: NormalizedRow | null };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Accepts YYYY-MM-DD and "D Mon YYYY" / "Month D, YYYY". Slash dates are rejected as ambiguous. */
export function parseDate(v: string): string | null | "invalid" {
  const t = v.trim();
  if (!t) return null;
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{1,2})[ -]([A-Za-z]{3,9})[ ,-]+(\d{4})$/.exec(t))) [d, m, y] = [Number(match[1]), MONTHS.indexOf(match[2].slice(0, 3).toLowerCase()) + 1, Number(match[3])];
  else if ((match = /^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})$/.exec(t))) [m, d, y] = [MONTHS.indexOf(match[1].slice(0, 3).toLowerCase()) + 1, Number(match[2]), Number(match[3])];
  else return "invalid";
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (m < 1 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return "invalid";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE = /^[0-9+() -]{7,20}$/;
const GOV = /^[0-9-]{9,15}$/;
const lower = (s: string) => s.trim().toLowerCase();

export function validateRows(mapped: Record<string, string>[], ref: RefData, today = new Date().toISOString().slice(0, 10)): RowResult[] {
  const seen = { employeeNo: new Map<string, number>(), prc: new Map<string, number>(), tin: new Map<string, number>(), gsis: new Map<string, number>(), ph: new Map<string, number>(), pi: new Map<string, number>(), nameDob: new Map<string, number>() };

  return mapped.map((raw, idx) => {
    const rowNo = idx + 2; // spreadsheet row (header is row 1)
    const issues: RowIssue[] = [];
    const bad = (field: string, message: string) => issues.push({ field, message });
    const g = (k: string) => (raw[k] ?? "").trim();

    const dup = (store: Map<string, number>, key: string, value: string, label: string, dbSet?: Set<string>) => {
      if (!value) return;
      const k = lower(value);
      if (dbSet?.has(k)) bad(key, `${label} "${value}" already exists in the system.`);
      const first = store.get(k);
      if (first) bad(key, `${label} "${value}" is repeated in this file (also row ${first}).`);
      else store.set(k, rowNo);
    };

    const first = g("first_name"), last = g("last_name");
    if (!first) bad("first_name", "First name is required.");
    if (!last) bad("last_name", "Last name is required.");

    const sexRaw = lower(g("sex"));
    const sex = !sexRaw ? null : ["m", "male"].includes(sexRaw) ? "male" : ["f", "female"].includes(sexRaw) ? "female" : (bad("sex", "Sex must be male or female."), null);

    const civilRaw = lower(g("civil_status"));
    const CIVIL = ["single", "married", "widowed", "separated", "annulled", "other"];
    const civil = !civilRaw ? null : CIVIL.includes(civilRaw) ? civilRaw : (bad("civil_status", `Civil status must be one of: ${CIVIL.join(", ")}.`), null);

    const dates: Record<string, string | null> = {};
    for (const k of ["birth_date", "original_appointment_date", "current_appointment_date", "date_assumed"]) {
      const d = parseDate(g(k));
      if (d === "invalid") { bad(k, "Invalid date. Use YYYY-MM-DD (e.g. 2024-03-15)."); dates[k] = null; }
      else dates[k] = d;
    }
    const { birth_date: birth, original_appointment_date: orig, current_appointment_date: cur, date_assumed: assumed } = dates;
    if (birth && birth >= today) bad("birth_date", "Date of birth cannot be today or in the future.");
    if (birth && orig && orig < `${Number(birth.slice(0, 4)) + 18}${birth.slice(4)}`) bad("original_appointment_date", "Appointment is earlier than the employee's 18th birthday.");
    if (orig && cur && cur < orig) bad("current_appointment_date", "Current appointment is earlier than the original appointment.");
    if (cur && assumed && assumed < cur) bad("date_assumed", "Date assumed is earlier than the appointment date.");

    const email = g("official_email");
    if (email && !EMAIL.test(email)) bad("official_email", "Invalid email address.");
    const mobile = g("mobile_no");
    if (mobile && !PHONE.test(mobile)) bad("mobile_no", "Invalid phone number.");
    for (const [k, label] of [["tin", "TIN"], ["gsis_bp_no", "GSIS BP number"], ["philhealth_no", "PhilHealth number"], ["pagibig_no", "Pag-IBIG number"]] as const) {
      if (g(k) && !GOV.test(g(k))) bad(k, `${label} must be 9–15 digits (dashes allowed).`);
    }

    dup(seen.employeeNo, "employee_no", g("employee_no"), "Employee ID", ref.existing.employeeNos);
    dup(seen.prc, "prc_employee_no", g("prc_employee_no"), "PRC employee number", ref.existing.prcNos);
    dup(seen.tin, "tin", g("tin"), "TIN", ref.existing.tins);
    dup(seen.gsis, "gsis_bp_no", g("gsis_bp_no"), "GSIS BP number", ref.existing.gsis);
    dup(seen.ph, "philhealth_no", g("philhealth_no"), "PhilHealth number", ref.existing.philhealth);
    dup(seen.pi, "pagibig_no", g("pagibig_no"), "Pag-IBIG number", ref.existing.pagibig);
    if (first && last && birth) dup(seen.nameDob, "last_name", `${last}|${first}|${birth}`, "A person with this name and birth date", ref.existing.nameDob);

    const pos = g("position");
    const position = pos ? ref.positions.find((p) => lower(p.code) === lower(pos) || lower(p.title) === lower(pos)) : undefined;
    if (pos && !position) bad("position", `Unknown position "${pos}". Add it under Administration → Positions first.`);
    const unitRaw = g("org_unit");
    const unit = unitRaw ? ref.orgUnits.find((u) => lower(u.code) === lower(unitRaw) || lower(u.name) === lower(unitRaw)) : undefined;
    if (unitRaw && !unit) bad("org_unit", `Unknown office/unit "${unitRaw}". Add it under Administration → Organization first.`);
    const stRaw = g("employment_status");
    const status = stRaw ? ref.statuses.find((s) => lower(s.code) === lower(stRaw) || lower(s.name) === lower(stRaw)) : undefined;
    if (stRaw && !status) bad("employment_status", `Unknown employment status "${stRaw}".`);

    const num = (k: string, lo: number, hi: number) => {
      const v = g(k);
      if (!v) return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n < lo || n > hi) { bad(k, `Must be a whole number from ${lo} to ${hi}.`); return null; }
      return n;
    };
    const sg = num("salary_grade", 1, 33), step = num("salary_step", 1, 8);
    if (step && !sg) bad("salary_step", "A step needs a salary grade.");

    const supNo = g("supervisor_employee_no");
    const supervisorId = supNo ? ref.existing.supervisorIdsByNo.get(lower(supNo)) : undefined;
    if (supNo && !supervisorId) bad("supervisor_employee_no", `Supervisor "${supNo}" was not found among existing employees.`);

    if (issues.length) return { rowNo, issues, normalized: null };
    const core: Record<string, unknown> = {
      first_name: first, last_name: last, middle_name: g("middle_name") || null, extension_name: g("extension_name") || null, sex,
      official_email: email || null, prc_employee_no: g("prc_employee_no") || null,
      position_id: position?.id ?? null, org_unit_id: unit?.id ?? null, employment_status_code: status?.code ?? null,
      salary_grade: sg, salary_step: step, original_appointment_date: orig, current_appointment_date: cur, date_assumed: assumed,
      supervisor_employee_id: supervisorId ?? null,
      ...(g("employee_no") ? { employee_no: g("employee_no") } : {}),
    };
    const priv: Record<string, unknown> = {
      birth_date: birth, civil_status: civil, mobile_no: mobile || null,
      tin: g("tin") || null, gsis_bp_no: g("gsis_bp_no") || null, philhealth_no: g("philhealth_no") || null, pagibig_no: g("pagibig_no") || null,
    };
    return { rowNo, issues, normalized: { core, private: priv } };
  });
}
