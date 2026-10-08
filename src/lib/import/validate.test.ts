import { describe, expect, it } from "vitest";
import { parseDate, validateRows, type RefData } from "./validate";
import { suggestMapping } from "./fields";

const ref = (over: Partial<RefData["existing"]> = {}): RefData => ({
  positions: [{ id: "p1", code: "PRO1", title: "Professional Regulation Officer I" }],
  orgUnits: [{ id: "u1", code: "LRD", name: "Licensure and Registration Division" }],
  statuses: [{ code: "PERMANENT", name: "Permanent" }],
  existing: {
    employeeNos: new Set(["emp-000001"]), prcNos: new Set(), tins: new Set(["123456789"]), gsis: new Set(), philhealth: new Set(), pagibig: new Set(),
    nameDob: new Set(), supervisorIdsByNo: new Map([["emp-000001", "sup-uuid"]]), ...over,
  },
});

const ok = { first_name: "Juan", last_name: "Dela Cruz", birth_date: "1995-03-14", position: "PRO1", org_unit: "LRD", employment_status: "Permanent", original_appointment_date: "2019-07-01" };

describe("parseDate", () => {
  it("accepts ISO and written dates, rejects ambiguous and impossible ones", () => {
    expect(parseDate("2024-03-05")).toBe("2024-03-05");
    expect(parseDate("5 Mar 2024")).toBe("2024-03-05");
    expect(parseDate("March 5, 2024")).toBe("2024-03-05");
    expect(parseDate("03/05/2024")).toBe("invalid");
    expect(parseDate("2024-02-30")).toBe("invalid");
    expect(parseDate("")).toBeNull();
  });
});

describe("validateRows", () => {
  it("normalizes a valid row and resolves references by code or name", () => {
    const [r] = validateRows([ok], ref(), "2026-10-08");
    expect(r.issues).toEqual([]);
    expect(r.normalized?.core).toMatchObject({ position_id: "p1", org_unit_id: "u1", employment_status_code: "PERMANENT" });
  });

  it("flags missing required fields, bad formats and unknown references", () => {
    const [r] = validateRows([{ first_name: "", last_name: "X", official_email: "nope", tin: "12", position: "Nope", sex: "?" }], ref(), "2026-10-08");
    const fields = r.issues.map((i) => i.field);
    expect(fields).toEqual(expect.arrayContaining(["first_name", "official_email", "tin", "position", "sex"]));
    expect(r.normalized).toBeNull();
  });

  it("detects duplicates in the file and against existing records", () => {
    const rows = [
      { ...ok, employee_no: "EMP-000001" },
      { ...ok, first_name: "Ana", tin: "123456789" },
      { ...ok, first_name: "Ben", employee_no: "NEW-1" },
      { ...ok, first_name: "Cai", employee_no: "NEW-1" },
    ];
    const res = validateRows(rows, ref(), "2026-10-08");
    expect(res[0].issues.some((i) => i.field === "employee_no" && /already exists/.test(i.message))).toBe(true);
    expect(res[1].issues.some((i) => i.field === "tin")).toBe(true);
    expect(res[3].issues.some((i) => /repeated in this file/.test(i.message))).toBe(true);
  });

  it("catches impossible employment dates", () => {
    const [a] = validateRows([{ ...ok, current_appointment_date: "2018-01-01" }], ref(), "2026-10-08");
    expect(a.issues.some((i) => i.field === "current_appointment_date")).toBe(true);
    const [b] = validateRows([{ ...ok, original_appointment_date: "2010-01-01" }], ref(), "2026-10-08");
    expect(b.issues.some((i) => /18th birthday/.test(i.message))).toBe(true);
    const [c] = validateRows([{ ...ok, birth_date: "2099-01-01" }], ref(), "2026-10-08");
    expect(c.issues.some((i) => i.field === "birth_date")).toBe(true);
  });

  it("flags the same name and birth date as a probable duplicate person", () => {
    const res = validateRows([ok, { ...ok, employee_no: "X2" }], ref(), "2026-10-08");
    expect(res[1].issues.some((i) => /name and birth date/.test(i.message))).toBe(true);
  });
});

describe("suggestMapping", () => {
  it("maps common spreadsheet headers", () => {
    const m = suggestMapping(["Surname", "Given Name", "DOB", "Designation", "SG", "Date Hired"]);
    expect(m).toMatchObject({ last_name: "Surname", first_name: "Given Name", birth_date: "DOB", position: "Designation", salary_grade: "SG", original_appointment_date: "Date Hired" });
  });
});
