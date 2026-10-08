import type { ReportDef, ReportFilters } from "@/lib/reports/definitions";
import type { Lookups } from "@/lib/data/lookups";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/form";

export function ReportFilterForm({ def, filters, lookups }: { def: ReportDef; filters: ReportFilters; lookups: Lookups }) {
  return (
    <form className="flex flex-wrap items-end gap-3" aria-label="Report filters">
      {def.filters.includes("from") && <TextField label="From" name="from" type="date" defaultValue={filters.from} />}
      {def.filters.includes("to") && <TextField label="To" name="to" type="date" defaultValue={filters.to} />}
      {def.filters.includes("year") && <TextField label="Year" name="year" type="number" min={2000} max={2100} defaultValue={filters.year} />}
      {def.filters.includes("division") && <SelectField label="Division" name="division" placeholder="All divisions" defaultValue={filters.division ?? ""} options={lookups.divisions.map((d) => ({ value: d.id, label: d.name }))} />}
      {def.filters.includes("status") && <SelectField label="Employment status" name="status" placeholder="All statuses" defaultValue={filters.status ?? ""} options={lookups.employmentStatuses.map((s) => ({ value: s.code, label: s.name }))} />}
      {def.filters.includes("record") && <SelectField label="Record status" name="record" defaultValue={filters.record ?? "active"} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "separated", label: "Separated" }, { value: "all", label: "All" }]} />}
      {def.filters.includes("employee") && <TextField label="Employee ID" name="employee" placeholder="EMP-000123" defaultValue={filters.employee} />}
      <Button type="submit">Run report</Button>
    </form>
  );
}
