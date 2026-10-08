import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/lib/auth/session";
import { Alert, Badge, Card, CardHeader, EmptyState, NoAccess, PageHeader, Stat } from "@/components/ui/primitives";
import { Table, TBody, Td, THead, Th } from "@/components/ui/table";
import { SelectField } from "@/components/ui/form";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Data quality" };

const CHECKS: Record<string, { label: string; group: "Incomplete" | "Duplicate" | "Inconsistent" | "Documents" }> = {
  MISSING_POSITION: { label: "No position assigned", group: "Incomplete" },
  MISSING_ORG_UNIT: { label: "No office/unit assigned", group: "Incomplete" },
  MISSING_EMPLOYMENT_STATUS: { label: "No employment status", group: "Incomplete" },
  MISSING_APPOINTMENT_DATE: { label: "No current appointment date", group: "Incomplete" },
  MISSING_PERSONAL_INFO: { label: "Missing personal information", group: "Incomplete" },
  MISSING_GOVERNMENT_ID: { label: "Missing government numbers", group: "Incomplete" },
  NO_SERVICE_RECORD: { label: "No service record", group: "Incomplete" },
  DUPLICATE_PERSON: { label: "Possible duplicate person", group: "Duplicate" },
  DUPLICATE_DOCUMENT: { label: "Same file stored twice", group: "Duplicate" },
  DATE_CONFLICT: { label: "Impossible or conflicting dates", group: "Inconsistent" },
  STATUS_CONFLICT: { label: "Status conflicts with dates", group: "Inconsistent" },
  SERVICE_RECORD_MISMATCH: { label: "Service record differs from employee record", group: "Inconsistent" },
  ORG_INCONSISTENT: { label: "Inconsistent organizational assignment", group: "Inconsistent" },
  SUPERVISOR_INACTIVE: { label: "Supervisor is not active", group: "Inconsistent" },
  MISSING_REQUIRED_DOCUMENT: { label: "Required document missing", group: "Documents" },
  EXPIRED_DOCUMENT: { label: "Document expired", group: "Documents" },
};
const tone = { error: "danger", warning: "warning", info: "info" } as const;

export default async function DataQualityPage({ searchParams }: { searchParams: Promise<{ check?: string; severity?: string }> }) {
  const ctx = await requireCtx();
  if (!ctx.can("dq.read")) return <NoAccess />;
  const sp = await searchParams;
  const { data, error } = await ctx.db.rpc("data_quality_report");
  if (error) throw error;
  const issues = data ?? [];
  const bySeverity = (s: string) => issues.filter((i) => i.severity === s).length;
  const groups = ["Incomplete", "Duplicate", "Inconsistent", "Documents"] as const;
  const groupCount = (g: string) => issues.filter((i) => CHECKS[i.check_code]?.group === g).length;
  const shown = issues.filter((i) => (!sp.check || i.check_code === sp.check) && (!sp.severity || i.severity === sp.severity));
  const affected = new Set(issues.map((i) => i.employee_id)).size;

  return (
    <>
      <PageHeader title="Data quality" description="Where personnel records are incomplete, duplicated or inconsistent. Fixing these keeps reports and certificates trustworthy." />
      <div className="space-y-6">
        {issues.length === 0 && <Alert tone="success" title="No issues detected">All checks passed for active employees.</Alert>}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          <Stat label="Errors" value={bySeverity("error")} tone={bySeverity("error") ? "danger" : undefined} />
          <Stat label="Warnings" value={bySeverity("warning")} tone={bySeverity("warning") ? "warning" : undefined} />
          <Stat label="Notes" value={bySeverity("info")} />
          <Stat label="Employees affected" value={affected} />
          {groups.map((g) => <Stat key={g} label={g} value={groupCount(g)} />)}
        </div>
        <Card>
          <CardHeader title="Issues" actions={
            <form className="flex flex-wrap items-end gap-2" aria-label="Filter issues">
              <SelectField label="Check" name="check" placeholder="All checks" defaultValue={sp.check ?? ""} options={Object.entries(CHECKS).map(([k, v]) => ({ value: k, label: v.label }))} />
              <SelectField label="Severity" name="severity" placeholder="All" defaultValue={sp.severity ?? ""} options={[{ value: "error", label: "Errors" }, { value: "warning", label: "Warnings" }, { value: "info", label: "Notes" }]} />
              <Button type="submit" variant="secondary">Filter</Button>
            </form>
          } />
          {shown.length === 0 ? <EmptyState title="Nothing to show" /> : (
            <Table caption="Data quality issues">
              <THead><Th>Severity</Th><Th>Check</Th><Th>Employee</Th><Th>Detail</Th></THead>
              <TBody>
                {shown.slice(0, 500).map((i, k) => (
                  <tr key={k}>
                    <Td><Badge tone={tone[i.severity as keyof typeof tone] ?? "neutral"}>{i.severity}</Badge></Td>
                    <Td>{CHECKS[i.check_code]?.label ?? i.check_code}</Td>
                    <Td>{ctx.can("employee.read_all") ? <Link className="text-brand-700 underline" href={`/personnel/${i.employee_id}`}>{i.full_name}</Link> : i.full_name}<div className="text-xs text-slate-500">{i.employee_no}</div></Td>
                    <Td>{i.detail}</Td>
                  </tr>
                ))}
              </TBody>
            </Table>
          )}
          {shown.length > 500 && <p className="px-4 py-3 text-xs text-slate-500">Showing 500 of {shown.length}. Narrow the filters.</p>}
        </Card>
        <p className="text-xs text-slate-500">Checks are rule-based and run live. AI-assisted suggestions (e.g. near-duplicate names) are planned and would only ever propose items for HR review — see Administration → AI assistance.</p>
      </div>
    </>
  );
}
