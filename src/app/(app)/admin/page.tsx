import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/lib/auth/session";
import { ADMIN_TABLES } from "@/lib/admin/tables";
import { Card, CardBody, NoAccess, PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Administration" };

export default async function AdminHub() {
  const ctx = await requireCtx();
  const groups: { title: string; items: { href: string; label: string; hint: string }[] }[] = [
    {
      title: "Access",
      items: [
        ...(ctx.can("admin.users") ? [{ href: "/admin/users", label: "Users", hint: "Accounts, invitations, activation" }] : []),
        ...(ctx.canAny("admin.roles", "admin.users") ? [{ href: "/admin/roles", label: "Roles & permissions", hint: "What each role may do" }] : []),
      ],
    },
    {
      title: "Organization",
      items: ADMIN_TABLES.filter((t) => ["org-units", "positions", "plantilla", "unit-types"].includes(t.key) && ctx.canAny("org.manage", "admin.config"))
        .map((t) => ({ href: `/admin/t/${t.key}`, label: t.title, hint: t.description })),
    },
    {
      title: "Lookups & rules",
      items: ADMIN_TABLES.filter((t) => !["org-units", "positions", "plantilla", "unit-types"].includes(t.key) && ctx.can("admin.config"))
        .map((t) => ({ href: `/admin/t/${t.key}`, label: t.title, hint: t.description })),
    },
    {
      title: "System",
      items: [
        ...(ctx.can("workflow.configure") ? [{ href: "/admin/workflows", label: "Workflows", hint: "Approval steps for leave, attendance and HR requests" }] : []),
        ...(ctx.can("admin.config") ? [
          { href: "/admin/settings", label: "System settings", hint: "Upload limits, notification channels, audit options" },
          { href: "/admin/integrations", label: "Integrations", hint: "External systems: status and requirements" },
          { href: "/admin/ai", label: "AI assistance", hint: "Status and guardrails" },
        ] : []),
      ],
    },
  ].filter((g) => g.items.length > 0);
  if (groups.length === 0) return <NoAccess />;
  return (
    <>
      <PageHeader title="Administration" description="Configure the system without changing code." />
      <div className="space-y-8">
        {groups.map((g) => (
          <section key={g.title} aria-labelledby={`g-${g.title}`}>
            <h2 id={`g-${g.title}`} className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{g.title}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {g.items.map((i) => (
                <Link key={i.href} href={i.href} className="block rounded-lg">
                  <Card className="h-full transition-shadow hover:shadow-md"><CardBody><p className="font-semibold text-brand-900">{i.label}</p><p className="mt-1 line-clamp-2 text-sm text-slate-600">{i.hint}</p></CardBody></Card>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
