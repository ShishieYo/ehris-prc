import type { Metadata } from "next";
import { requireCtx } from "@/lib/auth/session";
import { INTEGRATIONS } from "@/lib/integrations/registry";
import { CHANNELS } from "@/lib/services/notifications/channels";
import { Alert, Badge, Card, CardBody, NoAccess, PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Integrations" };

export default async function IntegrationsPage() {
  const ctx = await requireCtx();
  if (!ctx.canAny("admin.config", "admin.users")) return <NoAccess />;
  return (
    <>
      <PageHeader title="Integrations" description="Extension points for external systems." />
      <div className="space-y-4">
        <Alert tone="warning" title="None of these integrations is active">
          They are interfaces only. Each needs specifications or credentials from the agency before it can be built; the requirements are listed below.
        </Alert>
        {INTEGRATIONS.map((i) => (
          <Card key={i.key}>
            <CardBody>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-slate-900">{i.name}</h2>
                <Badge tone="neutral">{i.key === "email" || i.key === "sms" ? (CHANNELS[i.key].configured ? "configured" : "not configured") : "not configured"}</Badge>
              </div>
              <p className="mt-1 text-sm text-slate-600">{i.purpose}</p>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Required before use</p>
              <ul className="list-disc pl-5 text-sm text-slate-700">{i.requires.map((r) => <li key={r}>{r}</li>)}</ul>
              <p className="mt-2 text-xs text-slate-500">Extension point: {i.extensionPoint}</p>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
