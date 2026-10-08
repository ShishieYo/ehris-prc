import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/lib/auth/session";
import { Badge, Card, NoAccess, PageHeader } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { Table, TBody, Td, THead, Th } from "@/components/ui/table";

export const metadata: Metadata = { title: "Roles & permissions" };

export default async function RolesPage() {
  const ctx = await requireCtx();
  if (!ctx.canAny("admin.roles", "admin.users")) return <NoAccess />;
  const [roles, perms, userRoles] = await Promise.all([
    ctx.db.from("roles").select("*").order("name"),
    ctx.db.from("role_permissions").select("role_id"),
    ctx.db.from("user_roles").select("role_id"),
  ]);
  for (const r of [roles, perms]) if (r.error) throw r.error;
  const count = (rows: { role_id: string }[] | null, id: string) => (rows ?? []).filter((x) => x.role_id === id).length;
  return (
    <>
      <PageHeader title="Roles & permissions" description="A role is a named set of permissions. Permissions are enforced by the database, not only by the screens you see."
        actions={ctx.can("admin.roles") && <LinkButton href="/admin/roles/new">New role</LinkButton>} />
      <Card>
        <Table caption="Roles">
          <THead><Th>Role</Th><Th>Description</Th><Th>Permissions</Th><Th>Users</Th><Th><span className="sr-only">Open</span></Th></THead>
          <TBody>
            {(roles.data ?? []).map((r) => (
              <tr key={r.id}>
                <Td className="font-medium">{r.name} {r.is_system && <Badge tone="neutral">built-in</Badge>}<div className="font-mono text-xs text-slate-500">{r.code}</div></Td>
                <Td>{r.description}</Td><Td>{count(perms.data, r.id)}</Td><Td>{userRoles.error ? "—" : count(userRoles.data, r.id)}</Td>
                <Td><Link className="text-brand-700 underline" href={`/admin/roles/${r.id}`}>{ctx.can("admin.roles") && r.code !== "SUPER_ADMIN" ? "Edit" : "View"}</Link></Td>
              </tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
