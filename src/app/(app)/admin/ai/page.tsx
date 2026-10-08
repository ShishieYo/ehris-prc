import type { Metadata } from "next";
import { requireCtx } from "@/lib/auth/session";
import { aiProvider } from "@/lib/ai/provider";
import { Alert, Badge, Card, CardBody, CardHeader, NoAccess, PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "AI assistance" };

const FEATURES = [
  { name: "AI Data Quality Assistant", does: "Proposes possible duplicate records, inconsistent names, date conflicts and inconsistent employment history for HR to review.", today: "The rule-based checks on the Data Quality page are live. AI-assisted suggestions are not." },
  { name: "AI HR Assistant", does: "Helps employees find the right HR service, its requirements and the status of their request, answering only from approved internal sources and citing them.", today: "Not available. Employees use HR Requests and the request types' descriptions." },
  { name: "Document Assistant", does: "Extracts structured metadata (title, date, issuer) from uploaded documents into a review form.", today: "Not available. Metadata is entered by hand; HR verifies every document." },
];

export default async function AiPage() {
  const ctx = await requireCtx();
  if (!ctx.can("admin.config")) return <NoAccess />;
  return (
    <>
      <PageHeader title="AI assistance" description="Optional, human-in-the-loop helpers. The system assists HR; it never decides personnel matters." />
      <div className="space-y-4">
        <Alert tone="warning" title={`Status: ${aiProvider.configured ? "provider configured" : "not configured — no AI is used anywhere in this system"}`}>
          The extension point and guardrails are defined in <code>src/lib/ai/provider.ts</code>. Turning any of this on needs an agency decision on the provider, a Data Protection Officer review, and an approved knowledge base.
        </Alert>
        {FEATURES.map((f) => (
          <Card key={f.name}>
            <CardHeader title={f.name} actions={<Badge tone="neutral">planned</Badge>} />
            <CardBody><p className="text-sm text-slate-700">{f.does}</p><p className="mt-2 text-sm text-slate-500"><strong>Today:</strong> {f.today}</p></CardBody>
          </Card>
        ))}
        <Card>
          <CardHeader title="Guardrails (required for any implementation)" />
          <CardBody>
            <ul className="list-disc pl-5 text-sm text-slate-700">
              <li>Suggestions go to a review queue; HR accepts or rejects. AI never writes personnel data.</li>
              <li>Extracted document values must be validated by a person before they are saved.</li>
              <li>Government identifiers are never sent to an AI provider.</li>
              <li>The HR assistant answers only from approved sources and says so when it can&apos;t.</li>
              <li>Suggestions and decisions are recorded in the audit trail.</li>
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
