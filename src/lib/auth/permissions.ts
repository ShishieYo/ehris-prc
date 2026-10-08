/** Permission codes — must match public.permissions in the database. */
export const PERMISSIONS = [
  "employee.read_all", "employee.read_sensitive", "employee.write", "employee.manage_status", "team.view",
  "pds.read_all", "pds.write_any", "pds.verify", "service_record.read_all", "service_record.write",
  "document.read_all", "document.write", "document.verify", "document.delete",
  "attendance.read_all", "attendance.write", "leave.read_all", "leave.manage",
  "request.read_all", "request.process", "request.approve", "workflow.override", "workflow.configure",
  "report.view", "import.run", "dq.read", "dashboard.hr", "dashboard.executive", "audit.read",
  "org.manage", "admin.users", "admin.roles", "admin.config",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
