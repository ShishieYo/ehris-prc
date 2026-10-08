/**
 * Future integrations. NONE of these is implemented: each entry is an
 * interface plus a description of what is required before it can be switched
 * on. They are listed in Administration → Integrations so nobody mistakes a
 * placeholder for a working feature.
 */
export type IntegrationStatus = "not_configured";

export type Integration = {
  key: string;
  name: string;
  purpose: string;
  status: IntegrationStatus;
  /** What the agency must provide before this can be built. */
  requires: string[];
  /** Where in the codebase the extension point lives. */
  extensionPoint: string;
};

/** Biometric / DTR terminals → attendance_records (source = 'biometric'). */
export interface AttendanceSource {
  fetchLogs(range: { from: Date; to: Date }): Promise<{ employeeNo: string; at: Date; direction: "in" | "out" }[]>;
}

/** Payroll / personnel systems (two-way master data exchange). */
export interface PayrollSync {
  pullEmployees(): Promise<{ employeeNo: string; fields: Record<string, string> }[]>;
  pushChange(employeeNo: string, change: { field: string; value: string; effective: Date }): Promise<void>;
}

/** Document management / records systems. */
export interface DocumentStore {
  put(path: string, bytes: Uint8Array, mime: string): Promise<{ externalId: string }>;
  get(externalId: string): Promise<Uint8Array>;
}

export const INTEGRATIONS: Integration[] = [
  { key: "biometric", name: "Biometric attendance", purpose: "Import daily time logs from DTR terminals into attendance records.", status: "not_configured",
    requires: ["Terminal vendor/model and export or API specification", "Network path from the terminal server", "Mapping of terminal user IDs to employee IDs"], extensionPoint: "AttendanceSource in src/lib/integrations/registry.ts; writes attendance_records (source='biometric')" },
  { key: "payroll", name: "Personnel / payroll systems", purpose: "Keep position, salary grade and status consistent with payroll.", status: "not_configured",
    requires: ["Target system API or file specification and credentials", "Agreed system of record per field", "Reconciliation procedure"], extensionPoint: "PayrollSync; use the Import module's validation rules" },
  { key: "sso", name: "Agency single sign-on", purpose: "Sign in with the official PRC or Microsoft 365 / Google Workspace account.", status: "not_configured",
    requires: ["OIDC or SAML metadata from the identity provider", "Attribute mapping (email → profile)"], extensionPoint: "Supabase Auth provider settings; the app already trusts Supabase sessions only" },
  { key: "email", name: "Government email delivery", purpose: "Deliver notification emails and invitations.", status: "not_configured",
    requires: ["SMTP relay or Microsoft Graph application credentials", "Approved sender address"], extensionPoint: "NotificationChannel 'email' in src/lib/services/notifications/channels.ts" },
  { key: "sms", name: "SMS gateway", purpose: "Optional SMS alerts for urgent actions.", status: "not_configured",
    requires: ["Gateway contract and API credentials", "Consent policy for personal numbers"], extensionPoint: "NotificationChannel 'sms'" },
  { key: "dms", name: "Document management system", purpose: "Archive personnel files in the agency records system.", status: "not_configured",
    requires: ["DMS API specification", "Records retention rules"], extensionPoint: "DocumentStore" },
  { key: "gsis_csc", name: "GSIS / CSC records", purpose: "Verify eligibility and benefit records.", status: "not_configured",
    requires: ["Data-sharing agreement and API access from the respective agency"], extensionPoint: "New adapter behind Import validation" },
];
