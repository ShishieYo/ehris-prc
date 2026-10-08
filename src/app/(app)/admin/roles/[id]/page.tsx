import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/auth/session";
import { isUuid } from "@/lib/data/requests";
import { Alert, Card, CardBody, CardHeader, NoAccess, PageHeader } from "@/components/ui/primitives";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { FormGrid, TextAreaField, TextField } from "@/components/ui/form";
import { saveRole } from "../actions";

export const metadata: Metadata = { title: "Role" };

export default async function RolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  if (!ctx.canAny("admin.roles", "admin.users")) return <NoAccess />;
  const isNew = id === "new";
  if (!isNew && !isUuid(id)) notFound();

  const [role, perms, granted] = await Promise.all([
    isNew ? Promise.resolve({ data: null }) : ctx.db.from("roles").select("*").eq("id", id).maybeSingle(),
    ctx.db.from("permissions").select("*").order("module").order("code"),
    isNew ? Promise.resolve({ data: [] as { permission_code: string }[] }) : ctx.db.from("role_permissions").select("permission_code").eq("role_id", id),
  ]);
  if (!isNew && !role.data) notFound();
  if (perms.error) throw perms.error;
  const have = new Set((granted.data ?? []).map((g) => g.permission_code));
  const locked = !ctx.can("admin.roles") || role.data?.code === "SUPER_ADMIN";
  const byModule = new Map<string, NonNullable<typeof perms.data>>();
  for (const p of perms.data ?? []) byModule.set(p.module, [...(byModule.get(p.module) ?? []), p]);

  return (
    <>
      <PageHeader title={isNew ? "New role" : role.data!.name} description={role.data?.code === "SUPER_ADMIN" ? "The super administrator always holds every permission and can't be edited." : "Tick the permissions this role grants. You can only grant permissions you hold yourself."} />
      <ActionForm action={saveRole} className="space-y-6">
        <input type="hidden" name="role_id" value={role.data?.id ?? ""} />
        <Card>
          <CardBody>
            <FormGrid>
              <TextField label="Role code" name="code" required={isNew} disabled={!isNew} defaultValue={role.data?.code ?? ""} hint="Capital letters, digits and underscores, e.g. RECORDS_OFFICER" />
              <TextField label="Role name" name="name" required disabled={locked} defaultValue={role.data?.name ?? ""} />
            </FormGrid>
            <div className="mt-4"><TextAreaField label="Description" name="description" disabled={locked} defaultValue={role.data?.description ?? ""} /></div>
          </CardBody>
        </Card>
        {[...byModule.entries()].map(([module, list]) => (
          <Card key={module}>
            <CardHeader title={module[0].toUpperCase() + module.slice(1)} />
            <CardBody className="grid gap-3 sm:grid-cols-2">
              {list.map((p) => (
                <label key={p.code} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="permissions" value={p.code} defaultChecked={have.has(p.code)} disabled={locked || !ctx.can(p.code as Parameters<typeof ctx.can>[0])} className="mt-1 h-4 w-4" />
                  <span><span className="font-mono text-xs">{p.code}</span><br /><span className="text-slate-600">{p.description}</span></span>
                </label>
              ))}
            </CardBody>
          </Card>
        ))}
        {locked ? <Alert>Read-only.</Alert> : <SubmitButton>Save role</SubmitButton>}
      </ActionForm>
    </>
  );
}
