-- 0010_reference_data.sql
-- Configuration the system needs to run. These are editable defaults, NOT
-- statements of PRC/CSC policy; the agency must validate every value
-- (see docs/workflows.md "Assumptions requiring agency validation").
set search_path = public, extensions;

insert into public.permissions (code, module, description) values
  ('employee.read_all',       'employee',  'View all employee records (non-sensitive fields)'),
  ('employee.read_sensitive', 'employee',  'View personal and government identifiers, addresses'),
  ('employee.write',          'employee',  'Create and update employee records'),
  ('employee.manage_status',  'employee',  'Change employment status, record status and separation'),
  ('team.view',               'team',      'View and act for employees under own office/unit'),
  ('pds.read_all',            'pds',       'View any employee''s PDS'),
  ('pds.write_any',           'pds',       'Edit any employee''s PDS'),
  ('pds.verify',              'pds',       'Verify or return a certified PDS'),
  ('service_record.read_all', 'service',   'View any service record'),
  ('service_record.write',    'service',   'Create and edit service records'),
  ('document.read_all',       'document',  'View any personnel document'),
  ('document.write',          'document',  'Upload documents for any employee'),
  ('document.verify',         'document',  'Verify or reject personnel documents'),
  ('document.delete',         'document',  'Delete personnel documents'),
  ('attendance.read_all',     'attendance','View all attendance records'),
  ('attendance.write',        'attendance','Edit attendance records and finalize corrections'),
  ('leave.read_all',          'leave',     'View all leave applications and balances'),
  ('leave.manage',            'leave',     'Maintain leave balances and process leave'),
  ('request.read_all',        'request',   'View all HR requests'),
  ('request.process',         'request',   'Process and release HR requests'),
  ('request.approve',         'request',   'Approve HR requests'),
  ('workflow.override',       'workflow',  'Stand in for a missing supervisor; cancel any request'),
  ('workflow.configure',      'workflow',  'Configure workflows'),
  ('report.view',             'report',    'View and export HR reports'),
  ('import.run',              'import',    'Run data imports'),
  ('dq.read',                 'quality',   'View the data quality dashboard'),
  ('dashboard.hr',            'dashboard', 'View the HR dashboard'),
  ('dashboard.executive',     'dashboard', 'View the management dashboard'),
  ('audit.read',              'audit',     'View audit logs'),
  ('org.manage',              'admin',     'Manage offices, positions and plantilla'),
  ('admin.users',             'admin',     'Manage user accounts'),
  ('admin.roles',             'admin',     'Manage roles and permissions'),
  ('admin.config',            'admin',     'Manage lookups and system settings');

insert into public.roles (code, name, description, is_system) values
  ('SUPER_ADMIN', 'Super Administrator', 'Full system administration', true),
  ('HR_ADMIN',    'HR Administrator',    'Human resources / administrative management', true),
  ('HR_STAFF',    'HR Staff',            'Limited HR operational access', true),
  ('SUPERVISOR',  'Supervisor / Head of Office', 'Reviews requests of employees in their office or unit', true),
  ('EXECUTIVE',   'Executive / Regional Director', 'Management dashboard (aggregate information)', true),
  ('EMPLOYEE',    'Employee',            'Self-service access to own records', true),
  ('AUDITOR',     'Auditor (read-only)', 'Read-only review of records, reports and audit logs', true);

-- SUPER_ADMIN: everything.
insert into public.role_permissions (role_id, permission_code)
  select r.id, p.code from public.roles r cross join public.permissions p where r.code = 'SUPER_ADMIN';

insert into public.role_permissions (role_id, permission_code)
  select r.id, x.perm from public.roles r
  join (values
    ('HR_ADMIN', 'employee.read_all'), ('HR_ADMIN', 'employee.read_sensitive'), ('HR_ADMIN', 'employee.write'),
    ('HR_ADMIN', 'employee.manage_status'), ('HR_ADMIN', 'pds.read_all'), ('HR_ADMIN', 'pds.write_any'),
    ('HR_ADMIN', 'pds.verify'), ('HR_ADMIN', 'service_record.read_all'), ('HR_ADMIN', 'service_record.write'),
    ('HR_ADMIN', 'document.read_all'), ('HR_ADMIN', 'document.write'), ('HR_ADMIN', 'document.verify'),
    ('HR_ADMIN', 'document.delete'), ('HR_ADMIN', 'attendance.read_all'), ('HR_ADMIN', 'attendance.write'),
    ('HR_ADMIN', 'leave.read_all'), ('HR_ADMIN', 'leave.manage'), ('HR_ADMIN', 'request.read_all'),
    ('HR_ADMIN', 'request.process'), ('HR_ADMIN', 'request.approve'), ('HR_ADMIN', 'workflow.override'),
    ('HR_ADMIN', 'report.view'), ('HR_ADMIN', 'import.run'), ('HR_ADMIN', 'dq.read'), ('HR_ADMIN', 'dashboard.hr'),
    ('HR_ADMIN', 'org.manage'),
    ('HR_STAFF', 'employee.read_all'), ('HR_STAFF', 'employee.read_sensitive'), ('HR_STAFF', 'employee.write'),
    ('HR_STAFF', 'pds.read_all'), ('HR_STAFF', 'pds.write_any'), ('HR_STAFF', 'service_record.read_all'),
    ('HR_STAFF', 'document.read_all'), ('HR_STAFF', 'document.write'), ('HR_STAFF', 'attendance.read_all'),
    ('HR_STAFF', 'attendance.write'), ('HR_STAFF', 'leave.read_all'), ('HR_STAFF', 'leave.manage'),
    ('HR_STAFF', 'request.read_all'), ('HR_STAFF', 'request.process'), ('HR_STAFF', 'report.view'),
    ('HR_STAFF', 'dq.read'), ('HR_STAFF', 'dashboard.hr'),
    ('SUPERVISOR', 'team.view'),
    ('EXECUTIVE', 'dashboard.executive'),
    ('AUDITOR', 'employee.read_all'), ('AUDITOR', 'service_record.read_all'), ('AUDITOR', 'attendance.read_all'),
    ('AUDITOR', 'leave.read_all'), ('AUDITOR', 'request.read_all'), ('AUDITOR', 'report.view'),
    ('AUDITOR', 'dq.read'), ('AUDITOR', 'dashboard.hr'), ('AUDITOR', 'audit.read')
  ) x(role_code, perm) on x.role_code = r.code;

-- Structure vocabulary
insert into public.org_unit_types (code, name, sort_order) values
  ('regional_office', 'Regional Office', 1), ('office', 'Office', 2), ('division', 'Division', 3),
  ('section', 'Section', 4), ('unit', 'Unit', 5), ('service_center', 'Service Center', 6);

insert into public.employment_statuses (code, name, sort_order) values
  ('PERMANENT', 'Permanent', 1), ('TEMPORARY', 'Temporary', 2), ('CASUAL', 'Casual', 3),
  ('CONTRACTUAL', 'Contractual', 4), ('COS', 'Contract of Service', 5), ('JO', 'Job Order', 6),
  ('OTHER', 'Other', 9);

insert into public.appointment_natures (code, name, sort_order) values
  ('ORIGINAL', 'Original', 1), ('PROMOTION', 'Promotion', 2), ('TRANSFER', 'Transfer', 3),
  ('REAPPOINTMENT', 'Reappointment', 4), ('REINSTATEMENT', 'Reinstatement', 5), ('OTHER', 'Other', 9);

insert into public.attendance_statuses (code, name, counts_as_present, sort_order) values
  ('PRESENT', 'Present', true, 1), ('LATE', 'Late', true, 2), ('UNDERTIME', 'Undertime', true, 3),
  ('MISSING_LOG', 'Missing Log', false, 4), ('ABSENT', 'Absent', false, 5),
  ('OB', 'Official Business', true, 6), ('OT', 'Official Time', true, 7), ('LEAVE', 'Leave', false, 8),
  ('WFH', 'Work From Home', true, 9), ('HOLIDAY', 'Holiday', false, 10), ('OTHER', 'Other', false, 99);

insert into public.document_categories (code, name, group_name, is_required, requires_expiry, sort_order) values
  ('APPOINTMENT', 'Appointment Papers', 'Appointment', true, false, 1),
  ('OATH', 'Oath of Office', 'Appointment', false, false, 2),
  ('ASSUMPTION', 'Assumption to Duty', 'Appointment', false, false, 3),
  ('PDS', 'Personal Data Sheet', 'Personal', true, false, 4),
  ('BIRTH_CERT', 'Birth Certificate', 'Personal', false, false, 5),
  ('MARRIAGE_CERT', 'Marriage Certificate', 'Personal', false, false, 6),
  ('GOV_ID', 'Government ID', 'Personal', false, true, 7),
  ('DIPLOMA', 'Diploma', 'Education', false, false, 8),
  ('TRANSCRIPT', 'Transcript of Records', 'Education', false, false, 9),
  ('TRAINING_CERT', 'Training Certificate', 'Education', false, false, 10),
  ('SERVICE_RECORD', 'Service Record', 'Employment', false, false, 11),
  ('COE', 'Certificate of Employment', 'Employment', false, false, 12),
  ('PERFORMANCE', 'Performance Document', 'Employment', false, false, 13),
  ('CS_ELIGIBILITY', 'Civil Service Eligibility', 'Eligibility', false, false, 14),
  ('PRO_ELIGIBILITY', 'Professional Eligibility', 'Eligibility', false, true, 15),
  ('SUPPORTING', 'Supporting Document (request attachment)', 'Other', false, false, 90),
  ('OTHER', 'Other', 'Other', false, false, 99);

-- Leave types: names only. No entitlement or accrual rule is assumed; HR enters
-- balances and may set requires_balance per type.
insert into public.leave_types (code, name, requires_balance, deducts_balance, sort_order) values
  ('VL', 'Vacation Leave', true, true, 1), ('SL', 'Sick Leave', true, true, 2),
  ('SPL', 'Special Privilege Leave', true, true, 3), ('MFL', 'Mandatory / Forced Leave', false, true, 4),
  ('ML', 'Maternity Leave', false, false, 5), ('PL', 'Paternity Leave', false, false, 6),
  ('OTHER', 'Other Leave', false, false, 9);

insert into public.hr_request_types (code, name, description, requires_attachment, produces_document, sort_order) values
  ('COE', 'Certificate of Employment', 'Certification of employment status and period', false, true, 1),
  ('COE_COMP', 'Certificate of Employment with Compensation', 'Certification including compensation', false, true, 2),
  ('SERVICE_RECORD', 'Service Record', 'Certified copy of your service record', false, true, 3),
  ('CERTIFICATION', 'Certification', 'Other HR certification (state the purpose)', false, true, 4),
  ('DOC_COPY', 'Personnel Document Copy', 'Copy of a document in your 201 file', false, true, 5),
  ('PDS_UPDATE', 'PDS Update', 'Request HR to update your PDS', true, false, 6),
  ('PERSONAL_INFO_UPDATE', 'Personal Information Update', 'Change of name, civil status or other personal data', true, false, 7),
  ('EMPLOYMENT_CORRECTION', 'Employment Information Correction', 'Correct position, status, dates or assignment', true, false, 8),
  ('OTHER', 'Other HR Service', 'Any other HR service', false, false, 99);

insert into public.pds_declaration_questions (code, label, sort_order) values
  ('Q34', 'Item 34 — Relationship to appointing/recommending authority or chief of office', 34),
  ('Q35', 'Item 35 — Administrative offense or criminal charge', 35),
  ('Q36', 'Item 36 — Criminal conviction', 36),
  ('Q37', 'Item 37 — Separation from service', 37),
  ('Q38', 'Item 38 — Candidacy in a national or local election / resignation to campaign', 38),
  ('Q39', 'Item 39 — Immigrant or permanent resident status in another country', 39),
  ('Q40', 'Item 40 — Member of indigenous group, person with disability, or solo parent', 40);

-- Default workflows. Steps are editable by administrators.
insert into public.workflows (code, name, entity_type, description, is_default) values
  ('LEAVE_DEFAULT', 'Leave application', 'leave_application', 'Employee → Immediate Supervisor → HR', true),
  ('ATTENDANCE_CORRECTION_DEFAULT', 'Attendance correction', 'attendance_correction', 'Employee → Supervisor → HR', true),
  ('HR_REQUEST_DEFAULT', 'HR service request', 'hr_request', 'Employee → HR Staff → HR Approver → Release', true);

insert into public.workflow_steps (workflow_code, step_order, name, actor_kind, required_permission, status_on_approve) values
  ('LEAVE_DEFAULT', 1, 'For Supervisor Approval', 'supervisor', null, 'in_review'),
  ('LEAVE_DEFAULT', 2, 'For HR Processing', 'permission', 'leave.manage', 'approved'),
  ('ATTENDANCE_CORRECTION_DEFAULT', 1, 'For Supervisor Review', 'supervisor', null, 'approved'),
  ('ATTENDANCE_CORRECTION_DEFAULT', 2, 'For HR Finalization', 'permission', 'attendance.write', 'completed'),
  ('HR_REQUEST_DEFAULT', 1, 'Received / Under Review', 'permission', 'request.process', 'in_review'),
  ('HR_REQUEST_DEFAULT', 2, 'For Approval', 'permission', 'request.approve', 'approved'),
  ('HR_REQUEST_DEFAULT', 3, 'For Release', 'permission', 'request.process', 'completed');

insert into public.system_settings (key, value, description) values
  ('org.name', '"PRC Region III"', 'Agency display name'),
  ('privacy.notice_version', '"2026.1"', 'Increment to require users to re-acknowledge the privacy notice'),
  ('session.idle_timeout_minutes', '30', 'Sign users out after this many idle minutes'),
  ('documents.max_size_mb', '10', 'Maximum upload size'),
  ('documents.allowed_mime', '["application/pdf","image/jpeg","image/png"]', 'Accepted file types'),
  ('notifications.channels', '["in_app"]', 'Enabled channels: in_app, email, sms (email/sms need a delivery worker)'),
  ('audit.capture_network_metadata', 'false', 'Record IP / user agent in the audit trail. Enable only after the Data Protection Officer confirms the legal basis');
