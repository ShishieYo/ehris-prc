import type { Metadata } from "next";
import { requireCtx } from "@/lib/auth/session";
import { Alert, Card, CardBody, NoAccess, PageHeader } from "@/components/ui/primitives";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { TextField } from "@/components/ui/form";
import { env } from "@/lib/env";
import { saveSetting } from "./actions";

export const metadata: Metadata = { title: "System settings" };

export default async function SettingsPage() {
  const ctx = await requireCtx();
  if (!ctx.can("admin.config")) return <NoAccess />;
  const { data, error } = await ctx.db.from("system_settings").select("*").order("key");
  if (error) throw error;
  return (
    <>
      <PageHeader title="System settings" description="Non-secret configuration. Secrets (API keys, SMTP passwords) live in environment variables and are never shown or stored here." />
      <div className="space-y-4">
        <Alert title="Set by the deployment (environment)">Idle timeout: {env().SESSION_IDLE_MINUTES} min · Maximum session: {env().SESSION_MAX_HOURS} h. Change these in the hosting environment.</Alert>
        {(data ?? []).filter((s) => !s.key.startsWith("demo.")).map((s) => (
          <Card key={s.key}>
            <CardBody>
              <ActionForm action={saveSetting} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="key" value={s.key} />
                <div className="min-w-60 flex-1"><TextField label={s.key} name="value" defaultValue={JSON.stringify(s.value)} hint={s.description ?? undefined} /></div>
                <SubmitButton variant="secondary">Save</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
