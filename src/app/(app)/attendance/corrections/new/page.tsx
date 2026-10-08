import type { Metadata } from "next";
import { requireCtx } from "@/lib/auth/session";
import { Card, CardBody, NoAccess, PageHeader } from "@/components/ui/primitives";
import { CorrectionForm } from "@/components/attendance/correction-form";

export const metadata: Metadata = { title: "Request attendance correction" };

export default async function NewCorrectionPage({ searchParams }: { searchParams: Promise<{ date?: string; type?: string }> }) {
  const ctx = await requireCtx();
  if (!ctx.employeeId) return <NoAccess />;
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="Request attendance correction" description="Your supervisor reviews the request, then HR finalizes the correction in your DTR." />
      <Card><CardBody><CorrectionForm defaults={sp} /></CardBody></Card>
    </>
  );
}
