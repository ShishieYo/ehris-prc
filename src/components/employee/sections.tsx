import type { Row } from "@/lib/db/types";
import type { Lookups } from "@/lib/data/lookups";
import { Badge, Card, CardBody, CardHeader, DefList } from "@/components/ui/primitives";
import { fmtDate, titleCase } from "@/lib/format";

const fullName = (e: Row<"employees">) =>
  [e.first_name, e.middle_name, e.last_name, e.extension_name].filter(Boolean).join(" ");

const maskId = (v?: string | null) => (v ? `••••${v.slice(-4)}` : null);

export function EmployeeHeaderCard({ employee, lookups }: { employee: Row<"employees">; lookups: Lookups }) {
  return (
    <Card>
      <CardBody className="flex flex-wrap items-center gap-x-8 gap-y-2">
        <div>
          <h2 className="text-xl font-semibold text-brand-900">{fullName(employee)}</h2>
          <p className="text-sm text-slate-600">{lookups.positionTitle(employee.position_id) ?? "No position assigned"}</p>
        </div>
        <div className="text-sm text-slate-600">
          <p>{employee.employee_no}{employee.prc_employee_no ? ` · PRC No. ${employee.prc_employee_no}` : ""}</p>
          <p>{lookups.orgUnitPath(employee.org_unit_id) || "No office assigned"}</p>
        </div>
        <div className="flex gap-2">
          <Badge tone={employee.record_status === "active" ? "success" : "neutral"}>{titleCase(employee.record_status)}</Badge>
          {employee.employment_status_code && <Badge tone="info">{lookups.statusName(employee.employment_status_code)}</Badge>}
        </div>
      </CardBody>
    </Card>
  );
}

export function PersonalSection({ employee, priv, showFullIds }: { employee: Row<"employees">; priv: Row<"employee_private"> | null; showFullIds: boolean }) {
  const idv = (v?: string | null) => (showFullIds ? v : maskId(v));
  return (
    <Card>
      <CardHeader title="Personal information" description={priv ? undefined : "Some details are restricted to the employee and authorized HR personnel."} />
      <CardBody>
        <DefList
          items={[
            ["Employee ID", employee.employee_no],
            ["PRC employee number", employee.prc_employee_no],
            ["Full name", fullName(employee)],
            ["Sex", employee.sex ? titleCase(employee.sex) : null],
            ["Official email", employee.official_email],
            ...(priv
              ? ([
                  ["Date of birth", fmtDate(priv.birth_date)],
                  ["Place of birth", priv.birth_place],
                  ["Civil status", priv.civil_status ? titleCase(priv.civil_status) : null],
                  ["Citizenship", priv.citizenship],
                  ["Blood type", priv.blood_type],
                  ["TIN", idv(priv.tin)],
                  ["GSIS BP number", idv(priv.gsis_bp_no)],
                  ["PhilHealth number", idv(priv.philhealth_no)],
                  ["Pag-IBIG number", idv(priv.pagibig_no)],
                  ["Mobile number", priv.mobile_no],
                  ["Personal email", priv.personal_email],
                ] as [string, string | null][])
              : []),
          ]}
        />
      </CardBody>
    </Card>
  );
}

export function EmploymentSection({ employee, lookups, supervisor }: { employee: Row<"employees">; lookups: Lookups; supervisor?: string | null }) {
  const unit = lookups.orgUnits.find((u) => u.id === employee.org_unit_id);
  const ancestors: Record<string, string> = {};
  let cur = unit;
  while (cur) {
    ancestors[cur.unit_type] ??= cur.name;
    cur = cur.parent_id ? lookups.orgUnits.find((u) => u.id === cur!.parent_id) : undefined;
  }
  const item = lookups.plantilla.find((p) => p.id === employee.plantilla_item_id);
  return (
    <Card>
      <CardHeader title="Government employment information" />
      <CardBody>
        <DefList
          items={[
            ["Position", lookups.positionTitle(employee.position_id)],
            ["Salary grade / step", employee.salary_grade ? `SG ${employee.salary_grade}${employee.salary_step ? ` · Step ${employee.salary_step}` : ""}` : null],
            ["Employment status", lookups.statusName(employee.employment_status_code)],
            ["Nature of appointment", lookups.natureName(employee.appointment_nature_code)],
            ["Original appointment", fmtDate(employee.original_appointment_date)],
            ["Current appointment", fmtDate(employee.current_appointment_date)],
            ["Date assumed", fmtDate(employee.date_assumed)],
            ["Office", ancestors.regional_office ?? ancestors.office],
            ["Division", ancestors.division],
            ["Section", ancestors.section],
            ["Unit / service center", ancestors.unit ?? ancestors.service_center],
            ["Plantilla item", item?.item_number],
            ["Position number", employee.position_number],
            ["Immediate supervisor", supervisor],
            ["Separation date", employee.separation_date ? fmtDate(employee.separation_date) : null],
          ]}
        />
      </CardBody>
    </Card>
  );
}

export function AddressSection({ addresses }: { addresses: Row<"employee_addresses">[] }) {
  return (
    <Card>
      <CardHeader title="Addresses" />
      <CardBody>
        {addresses.length === 0 ? (
          <p className="text-sm text-slate-500">No address on file.</p>
        ) : (
          <DefList
            items={addresses.map((a) => [
              titleCase(a.address_type),
              [a.house_no, a.street, a.subdivision, a.barangay, a.city_municipality, a.province, a.zip_code].filter(Boolean).join(", "),
            ])}
          />
        )}
      </CardBody>
    </Card>
  );
}
