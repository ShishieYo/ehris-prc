import type { Metadata } from "next";
import { requireCtx } from "@/lib/auth/session";
import { getLookups } from "@/lib/data/lookups";
import { Card, CardBody, NoAccess, PageHeader } from "@/components/ui/primitives";
import { HrRequestForm } from "@/components/requests/hr-request-form";

export const metadata: Metadata = { title: "New HR request" };

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const ctx = await requireCtx();
  if (!ctx.employeeId) return <NoAccess />;
  const { type } = await searchParams;
  const lookups = await getLookups(ctx);
  return (
    <>
      <PageHeader title="New HR request" description="Submit online instead of visiting HR. You can follow each step on the request page." />
      <Card><CardBody><HrRequestForm lookups={lookups} defaultType={type} /></CardBody></Card>
    </>
  );
}
