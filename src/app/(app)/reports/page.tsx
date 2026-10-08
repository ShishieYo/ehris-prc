import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/lib/auth/session";
import { availableReports } from "@/lib/reports/definitions";
import { Card, CardBody, NoAccess, PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const ctx = await requireCtx();
  const reports = availableReports(ctx);
  if (reports.length === 0) return <NoAccess />;
  return (
    <>
      <PageHeader title="Reports" description="Run a report, filter it, and export to Excel, PDF or CSV. Exports are logged." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {reports.map((r) => (
          <Link key={r.key} href={`/reports/${r.key}`} className="block rounded-lg focus-visible:outline-offset-4">
            <Card className="h-full transition-shadow hover:shadow-md"><CardBody>
              <h2 className="font-semibold text-brand-900">{r.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{r.description}</p>
            </CardBody></Card>
          </Link>
        ))}
      </div>
    </>
  );
}
