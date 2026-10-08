import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/lib/auth/session";
import { listEmployeeOptions } from "@/lib/data/employees";
import { Alert, Badge, Card, CardBody, CardHeader, NoAccess, PageHeader } from "@/components/ui/primitives";
import { Table, TBody, Td, THead, Th } from "@/components/ui/table";
import { ActionForm, InlineAction, SubmitButton } from "@/components/ui/action-form";
import { CheckboxField, FormGrid, SelectField, TextField } from "@/components/ui/form";
import { provisionUser, setUserActive, updateUserRoles } from "./actions";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const ctx = await requireCtx();
  if (!ctx.can("admin.users")) return <NoAccess />;
  const { edit } = await searchParams;
  const [profiles, roles, userRoles, employees] = await Promise.all([
    ctx.db.from("profiles").select("*").order("display_name"),
    ctx.db.from("roles").select("*").order("name"),
    ctx.db.from("user_roles").select("*"),
    listEmployeeOptions(ctx),
  ]);
  for (const r of [profiles, roles, userRoles]) if (r.error) throw r.error;
  const roleName = new Map((roles.data ?? []).map((r) => [r.id, r]));
  const rolesFor = (uid: string) => (userRoles.data ?? []).filter((x) => x.user_id === uid).map((x) => roleName.get(x.role_id)).filter(Boolean);
  const empName = new Map(employees.map((e) => [e.id, e.full_name]));
  const editing = (profiles.data ?? []).find((p) => p.user_id === edit);

  return (
    <>
      <PageHeader title="Users" description="Accounts, linked employee records and roles. New users are invited by email and choose their own password." actions={<Link href="/admin" className="text-sm text-brand-700 underline">Administration</Link>} />
      <div className="space-y-6">
        <Card>
          <Table caption="User accounts">
            <THead><Th>Name</Th><Th>Email</Th><Th>Employee record</Th><Th>Roles</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></THead>
            <TBody>
              {(profiles.data ?? []).map((p) => (
                <tr key={p.user_id}>
                  <Td className="font-medium">{p.display_name}</Td>
                  <Td>{p.email ?? "—"}</Td>
                  <Td>{p.employee_id ? empName.get(p.employee_id) ?? "Linked" : "—"}</Td>
                  <Td className="space-x-1">{rolesFor(p.user_id).map((r) => <Badge key={r!.id} tone="info">{r!.name}</Badge>)}</Td>
                  <Td>{p.is_active ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Inactive</Badge>}</Td>
                  <Td className="whitespace-nowrap">
                    <Link className="text-brand-700 underline" href={`/admin/users?edit=${p.user_id}#edit`}>Roles</Link>{" · "}
                    <InlineAction action={setUserActive} hidden={{ user_id: p.user_id, active: String(!p.is_active) }}>
                      <SubmitButton variant="ghost" size="sm" confirm={p.is_active ? "Deactivate this account? They will lose all access." : "Reactivate this account?"}>{p.is_active ? "Deactivate" : "Reactivate"}</SubmitButton>
                    </InlineAction>
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        </Card>

        {editing && (
          <Card>
            <CardHeader title={`Roles for ${editing.display_name}`} />
            <CardBody>
              <div id="edit" />
              <ActionForm action={updateUserRoles}>
                <input type="hidden" name="user_id" value={editing.user_id} />
                <div className="grid gap-2 sm:grid-cols-2">
                  {(roles.data ?? []).map((r) => (
                    <CheckboxField key={r.id} name="roles" value={r.code} label={`${r.name}`} defaultChecked={rolesFor(editing.user_id).some((x) => x!.id === r.id)} />
                  ))}
                </div>
                <SubmitButton>Save roles</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader title="Invite a user" description="Link the account to the employee record so self-service works." />
          <CardBody>
            <Alert title="Before inviting">The employee record should already exist. The invitation email is sent by your configured Supabase email provider.</Alert>
            <div className="mt-4">
              <ActionForm action={provisionUser}>
                <FormGrid cols={3}>
                  <TextField label="Email address" name="email" type="email" required />
                  <TextField label="Display name" name="display_name" required />
                  <SelectField label="Employee record" name="employee_id" placeholder="— none (system account) —" options={employees.map((e) => ({ value: e.id, label: `${e.full_name} (${e.employee_no})` }))} />
                </FormGrid>
                <fieldset className="mt-2">
                  <legend className="mb-1 text-sm font-medium">Roles</legend>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {(roles.data ?? []).map((r) => <CheckboxField key={r.id} name="roles" value={r.code} label={r.name} defaultChecked={r.code === "EMPLOYEE"} />)}
                  </div>
                </fieldset>
                <SubmitButton pendingText="Sending…">Send invitation</SubmitButton>
              </ActionForm>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
