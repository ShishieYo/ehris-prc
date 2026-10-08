-- 0011_audit_triggers.sql
-- Attach the generic audit trigger to master and transaction tables.
-- 'redact' keeps the changed field names but masks the values (personal data).
set search_path = public, extensions;

do $$
declare
  t text;
  m text;
  r text;
begin
  for t, m, r in values
    ('employees', 'employee', ''), ('employee_private', 'employee', 'redact'),
    ('employee_addresses', 'employee', 'redact'),
    ('employee_family', 'pds', 'redact'), ('employee_education', 'pds', ''),
    ('employee_eligibility', 'pds', ''), ('employee_work_experience', 'pds', ''),
    ('employee_voluntary_work', 'pds', ''), ('employee_training', 'pds', ''),
    ('employee_other_info', 'pds', ''), ('employee_references', 'pds', 'redact'),
    ('employee_gov_ids', 'pds', 'redact'), ('pds_declaration_answers', 'pds', 'redact'),
    ('pds_submissions', 'pds', ''),
    ('service_records', 'service_record', ''),
    ('documents', 'document', ''), ('document_versions', 'document', ''),
    ('attendance_records', 'attendance', ''), ('attendance_corrections', 'attendance', ''),
    ('leave_applications', 'leave', ''), ('leave_balances', 'leave', ''),
    ('hr_requests', 'hr_request', ''),
    ('profiles', 'access', ''), ('user_roles', 'access', ''), ('roles', 'access', ''),
    ('role_permissions', 'access', ''),
    ('org_units', 'organization', ''), ('positions', 'organization', ''), ('plantilla_items', 'organization', ''),
    ('org_unit_types', 'configuration', ''), ('employment_statuses', 'configuration', ''),
    ('appointment_natures', 'configuration', ''), ('attendance_statuses', 'configuration', ''),
    ('leave_types', 'configuration', ''), ('document_categories', 'configuration', ''),
    ('hr_request_types', 'configuration', ''), ('pds_declaration_questions', 'configuration', ''),
    ('holidays', 'configuration', ''), ('system_settings', 'configuration', ''),
    ('workflows', 'configuration', ''), ('workflow_steps', 'configuration', ''),
    ('import_batches', 'import', '')
  loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row_change(%L%s)',
      'audit_' || t, t, m, case when r = 'redact' then ', ''redact''' else '' end);
  end loop;
end $$;
