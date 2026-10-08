/**
 * Privacy notice shown at /privacy and on first sign-in.
 * TEMPLATE: this text must be reviewed and approved by the agency's Data
 * Protection Officer and legal counsel before production use. Bump
 * system_settings 'privacy.notice_version' whenever it changes to require
 * every user to acknowledge it again.
 */
export const PRIVACY_NOTICE = {
  title: "Privacy Notice and Data Access Acknowledgement",
  intro:
    "This system processes personal information of PRC Region III personnel to administer human resource functions. Access is limited to authorized personnel and is recorded.",
  sections: [
    {
      heading: "What we collect and why",
      body: "Personal, employment, attendance, leave, service record and document information, used to maintain personnel records, process HR requests, and support management reporting and statutory compliance.",
    },
    {
      heading: "Who can see your information",
      body: "You can see your own records. Your supervisor sees only the information needed to review requests and attendance of their team. HR personnel see records according to their assigned role. Government identifiers and personnel files are available only to roles that need them. Management dashboards show aggregate figures only.",
    },
    {
      heading: "Monitoring and audit",
      body: "Sign-ins, record changes, document views and downloads, approvals and administrative actions are logged with the date, time and user. Audit records cannot be edited or deleted.",
    },
    {
      heading: "Your responsibilities",
      body: "Use your own account, keep your password confidential, sign out on shared computers, and access only the records you need for your official duties. Misuse of personal information may result in administrative, civil or criminal liability.",
    },
    {
      heading: "Your rights",
      body: "Subject to the Data Privacy Act of 2012 (RA 10173) and agency policy, you may request access to, and correction of, your personal information. Use the HR Requests module or contact the Data Protection Officer.",
    },
    {
      heading: "Retention and contact",
      body: "Records are kept according to the agency's records retention schedule [to be confirmed by the agency]. Data Protection Officer contact: [to be provided by the agency].",
    },
  ],
} as const;
