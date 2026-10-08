import type { Ctx } from "@/lib/auth/session";

export type NavItem = { href: string; label: string; icon: string; badge?: number };

/** Sidebar entries visible to the signed-in user (UI hint only — the database enforces access). */
export function buildNav(ctx: Ctx, counts: { unread: number; approvals: number }): { primary: NavItem[]; manage: NavItem[] } {
  const self = !!ctx.employeeId;
  const primary: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    ...(self ? [{ href: "/profile", label: "My Profile", icon: "user" }] : []),
    ...(ctx.canAny("employee.read_all", "team.view") ? [{ href: "/personnel", label: "Personnel Records", icon: "users" }] : []),
    ...(self || ctx.can("pds.read_all") ? [{ href: "/pds", label: "PDS", icon: "form" }] : []),
    ...(self || ctx.can("service_record.read_all") ? [{ href: "/service-record", label: "Service Record", icon: "record" }] : []),
    ...(self || ctx.can("document.read_all") ? [{ href: "/documents", label: "Documents", icon: "folder" }] : []),
    ...(self || ctx.canAny("attendance.read_all", "team.view") ? [{ href: "/attendance", label: "Time & Attendance", icon: "clock" }] : []),
    ...(self || ctx.can("leave.read_all") ? [{ href: "/leave", label: "Leave", icon: "calendar" }] : []),
    ...(self || ctx.can("request.read_all") ? [{ href: "/requests", label: "HR Requests", icon: "inbox" }] : []),
    ...(ctx.canAny("team.view", "leave.manage", "attendance.write", "request.process", "request.approve", "workflow.override")
      ? [{ href: "/approvals", label: "For My Action", icon: "check", badge: counts.approvals }]
      : []),
    { href: "/notifications", label: "Notifications", icon: "bell", badge: counts.unread },
  ];
  const manage: NavItem[] = [
    ...(ctx.can("report.view") ? [{ href: "/reports", label: "Reports", icon: "chart" }] : []),
    ...(ctx.can("dq.read") ? [{ href: "/data-quality", label: "Data Quality", icon: "quality" }] : []),
    ...(ctx.can("import.run") ? [{ href: "/import", label: "Data Import", icon: "import" }] : []),
    ...(ctx.canAny("admin.users", "admin.roles", "admin.config", "org.manage", "workflow.configure")
      ? [{ href: "/admin", label: "Administration", icon: "cog" }]
      : []),
    ...(ctx.can("audit.read") ? [{ href: "/audit", label: "Audit Logs", icon: "audit" }] : []),
  ];
  return { primary, manage };
}
