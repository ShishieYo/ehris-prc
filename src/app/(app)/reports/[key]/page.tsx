import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/auth/session";
import { getLookups } from "@/lib/data/lookups";
import { availableReports, defaultFilters, reportByKey, type ReportFilters } from "@/lib/reports/definitions";
import { logEvent } from "@/lib/audit";
import { Card, CardBody, EmptyState, NoAccess, PageHeader } from "@/components/ui/primitives";
import { FileLinkButton } from "@/components/ui/button";
import { Table, TBody, Td, THead, Th } from "@/components/ui/table";
import { ReportFilterForm } from "@/components/reports/filter-form";

export const metadata: Metadata = { title: "Report" };
const SHOW = 500;

export default async function ReportPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<ReportFilters> }) {
  const { key } = await params;
  const ctx = await requireCtx();
  const def = reportByKey(key);
  if (!def) notFound();
  if (!availableReports(ctx).some((r) => r.key === key)) return <NoAccess />;

  const sp = await searchParams;
  const filters = { ...defaultFilters(), ...Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v === "string" && v !== "")) } as ReportFilters;
  const [lookups, result] = await Promise.all([getLookups(ctx), def.run(ctx, filters)]);
  await logEvent(ctx, "report.generated", "report", { entityType: "report", entityId: key });
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageHeader
        title={def.title} description={def.description}
        actions={<>
          <FileLinkButton href={`/reports/${key}/export?format=xlsx&${qs}`} variant="secondary">Excel</FileLinkButton>
          <FileLinkButton href={`/reports/${key}/export?format=pdf&${qs}`} variant="secondary">PDF</FileLinkButton>
          <FileLinkButton href={`/reports/${key}/export?format=csv&${qs}`} variant="secondary">CSV</FileLinkButton>
        </>}
      />
      <Card className="mb-4"><CardBody><ReportFilterForm def={def} filters={filters} lookups={lookups} /></CardBody></Card>
      <Card>
        {result.rows.length === 0 ? <EmptyState title="No data for these filters" /> : (
          <>
            <Table caption={def.title}>
              <THead>{result.columns.map((c) => <Th key={c}>{c}</Th>)}</THead>
              <TBody>
                {result.rows.slice(0, SHOW).map((r, i) => <tr key={i}>{r.map((c, j) => <Td key={j}>{String(c)}</Td>)}</tr>)}
              </TBody>
            </Table>
            <p className="px-4 py-3 text-xs text-slate-500">{result.rows.length} rows{result.rows.length > SHOW ? ` (first ${SHOW} shown — export for the full list)` : ""}.</p>
          </>
        )}
      </Card>
    </>
  );
}
