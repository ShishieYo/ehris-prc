-- 0009_rls_grants_admin.sql
-- Defense in depth, enforced by the database:
--   1. Table/function privileges are revoked broadly and re-granted narrowly.
--   2. Row Level Security is enabled on every table; no policy = no access.
--   3. Writes that carry business meaning go through SECURITY DEFINER functions.
set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. Privileges. Supabase grants broad default privileges to anon/authenticated
--    on new public objects; remove them and grant explicitly.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
-- PostgreSQL grants EXECUTE to PUBLIC on new functions unless revoked globally.
alter default privileges revoke execute on functions from public;

-- Read access (rows are still filtered by RLS).
grant select on all tables in schema public to authenticated;
revoke select on public.number_counters, public.notification_outbox from authenticated;

-- Direct writes allowed (each additionally constrained by a policy below).
grant insert, update, delete on
  public.org_unit_types, public.employment_statuses, public.appointment_natures, public.positions,
  public.plantilla_items, public.org_units, public.attendance_statuses, public.leave_types,
  public.document_categories, public.hr_request_types, public.pds_declaration_questions, public.holidays,
  public.system_settings, public.workflows, public.workflow_steps,
  public.employee_addresses, public.employee_family, public.employee_education, public.employee_eligibility,
  public.employee_work_experience, public.employee_voluntary_work, public.employee_training,
  public.employee_other_info, public.employee_references, public.employee_gov_ids,
  public.pds_declaration_answers, public.service_records, public.attendance_records, public.leave_balances,
  public.leave_applications, public.attendance_corrections, public.hr_requests,
  public.import_batches, public.import_rows
  to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant delete on public.notifications to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Functions callable by signed-in users (policies, views and the RPC surface).
-- Everything not listed here (notify, next_number, wf_log, ...) is internal.
grant execute on function
  public.my_access(), public.has_permission(text), public.has_role(text), public.current_employee_id(), public.is_self(uuid),
  public.supervises(uuid), public.can_read_employee(uuid), public.can_read_document(uuid),
  public.can_upload_document_for(uuid), public.can_read_request(text, uuid),
  public.wf_can_act(public.workflow_steps, uuid), public.working_days(date, date),
  public.hr_save_employee(uuid, jsonb, jsonb, text), public.update_my_contact(text, text),
  public.acknowledge_privacy(text), public.pds_certify(), public.pds_review(uuid, text, text),
  public.create_document(uuid, text, text, date, text, date, text, text, uuid, text, text, text, bigint, text),
  public.add_document_version(uuid, text, text, text, bigint, text, text),
  public.update_document_details(uuid, text, date, text, date, text),
  public.set_document_status(uuid, text, text), public.delete_document(uuid, text),
  public.wf_submit(text, uuid), public.wf_act(text, uuid, text, text), public.wf_comment(text, uuid, text),
  public.hr_request_assign(uuid, uuid), public.hr_request_attach_result(uuid, uuid),
  public.my_pending_actions(), public.commit_employee_import(uuid),
  public.log_event(text, text, text, text, uuid, jsonb), public.employee_change_history(uuid),
  public.profile_completion(uuid), public.search_employees(text, uuid, text, text, int, int),
  public.dashboard_hr(), public.dashboard_executive(), public.data_quality_report(),
  public.report_attendance_summary(date, date, uuid), public.report_leave_summary(int, uuid),
  public.report_personnel_movement(date, date), public.report_plantilla_summary(),
  public.report_hr_requests(date, date), public.report_document_compliance(),
  public.report_training_summary(date, date)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Row Level Security
-- ---------------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- Shared reference data: readable by every signed-in user, changed by administrators.
do $$
declare
  t text;
  w text;
begin
  for t, w in values
    ('org_unit_types', 'org.manage'), ('employment_statuses', 'admin.config'), ('appointment_natures', 'admin.config'),
    ('positions', 'org.manage'), ('plantilla_items', 'org.manage'), ('org_units', 'org.manage'),
    ('attendance_statuses', 'admin.config'), ('leave_types', 'admin.config'), ('document_categories', 'admin.config'),
    ('hr_request_types', 'admin.config'), ('pds_declaration_questions', 'admin.config'), ('holidays', 'admin.config'),
    ('system_settings', 'admin.config'), ('workflows', 'workflow.configure'), ('workflow_steps', 'workflow.configure')
  loop
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.has_permission(%L))', t || '_insert', t, w);
    execute format('create policy %I on public.%I for update to authenticated using (public.has_permission(%L)) with check (public.has_permission(%L))', t || '_update', t, w, w);
    execute format('create policy %I on public.%I for delete to authenticated using (public.has_permission(%L))', t || '_delete', t, w);
  end loop;
end $$;

-- RBAC catalogue: readable; changed only through admin_* functions.
create policy permissions_read on public.permissions for select to authenticated using (true);
create policy roles_read on public.roles for select to authenticated using (true);
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);
create policy user_roles_read on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_permission('admin.users') or public.has_permission('admin.roles'));
create policy profiles_read on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.has_permission('admin.users'));

-- Employee master record
create policy employees_read on public.employees for select to authenticated
  using (public.can_read_employee(id));
create policy employee_private_read on public.employee_private for select to authenticated
  using (public.is_self(employee_id) or public.has_permission('employee.read_sensitive'));
create policy employee_addresses_read on public.employee_addresses for select to authenticated
  using (public.is_self(employee_id) or public.has_permission('employee.read_sensitive'));
create policy employee_addresses_insert on public.employee_addresses for insert to authenticated
  with check (public.is_self(employee_id) or public.has_permission('employee.write'));
create policy employee_addresses_update on public.employee_addresses for update to authenticated
  using (public.is_self(employee_id) or public.has_permission('employee.write'))
  with check (public.is_self(employee_id) or public.has_permission('employee.write'));
create policy employee_addresses_delete on public.employee_addresses for delete to authenticated
  using (public.is_self(employee_id) or public.has_permission('employee.write'));

-- PDS sections: the employee maintains their own; HR may read/write all.
do $$
declare t text;
begin
  foreach t in array array[
    'employee_family', 'employee_education', 'employee_eligibility', 'employee_work_experience',
    'employee_voluntary_work', 'employee_training', 'employee_other_info', 'employee_references',
    'employee_gov_ids', 'pds_declaration_answers']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_self(employee_id) or public.has_permission(%L))', t || '_read', t, 'pds.read_all');
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_self(employee_id) or public.has_permission(%L))', t || '_insert', t, 'pds.write_any');
    execute format('create policy %I on public.%I for update to authenticated using (public.is_self(employee_id) or public.has_permission(%L)) with check (public.is_self(employee_id) or public.has_permission(%L))', t || '_update', t, 'pds.write_any', 'pds.write_any');
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_self(employee_id) or public.has_permission(%L))', t || '_delete', t, 'pds.write_any');
  end loop;
end $$;
create policy pds_submissions_read on public.pds_submissions for select to authenticated
  using (public.is_self(employee_id) or public.has_permission('pds.read_all'));

-- Service record: employee reads own; HR manages. (Supervisors do not see salary data.)
create policy service_records_read on public.service_records for select to authenticated
  using (public.is_self(employee_id) or public.has_permission('service_record.read_all'));
create policy service_records_insert on public.service_records for insert to authenticated
  with check (public.has_permission('service_record.write'));
create policy service_records_update on public.service_records for update to authenticated
  using (public.has_permission('service_record.write')) with check (public.has_permission('service_record.write'));
create policy service_records_delete on public.service_records for delete to authenticated
  using (public.has_permission('service_record.write'));

-- Documents: read-only through RLS; writes via create_document & friends.
create policy documents_read on public.documents for select to authenticated
  using (public.can_read_document(id));
create policy document_versions_read on public.document_versions for select to authenticated
  using (public.can_read_document(document_id));

-- Attendance
create policy attendance_records_read on public.attendance_records for select to authenticated
  using (public.is_self(employee_id) or public.has_permission('attendance.read_all') or public.supervises(employee_id));
create policy attendance_records_insert on public.attendance_records for insert to authenticated
  with check (public.has_permission('attendance.write'));
create policy attendance_records_update on public.attendance_records for update to authenticated
  using (public.has_permission('attendance.write')) with check (public.has_permission('attendance.write'));
create policy attendance_records_delete on public.attendance_records for delete to authenticated
  using (public.has_permission('attendance.write'));

-- Leave balances
create policy leave_balances_read on public.leave_balances for select to authenticated
  using (public.is_self(employee_id) or public.has_permission('leave.read_all') or public.supervises(employee_id));
create policy leave_balances_insert on public.leave_balances for insert to authenticated
  with check (public.has_permission('leave.manage'));
create policy leave_balances_update on public.leave_balances for update to authenticated
  using (public.has_permission('leave.manage')) with check (public.has_permission('leave.manage'));
create policy leave_balances_delete on public.leave_balances for delete to authenticated
  using (public.has_permission('leave.manage'));

-- Workflow-driven transactions: visible to the requester, their supervisors and
-- HR; the requester edits only while it is still a draft.
do $$
declare t text; p text;
begin
  for t, p in values
    ('leave_applications', 'leave.read_all'), ('attendance_corrections', 'attendance.read_all'),
    ('hr_requests', 'request.read_all')
  loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_self(employee_id) or public.supervises(employee_id) or public.has_permission(%L))', t || '_read', t, p);
    execute format('create policy %I on public.%I for insert to authenticated with check (employee_id = public.current_employee_id() and status = %L)', t || '_insert', t, 'draft');
    execute format('create policy %I on public.%I for update to authenticated using (employee_id = public.current_employee_id() and status = %L) with check (employee_id = public.current_employee_id())', t || '_update', t, 'draft');
    execute format('create policy %I on public.%I for delete to authenticated using (employee_id = public.current_employee_id() and status = %L)', t || '_delete', t, 'draft');
  end loop;
end $$;
create policy workflow_actions_read on public.workflow_actions for select to authenticated
  using (public.can_read_request(entity_type, entity_id));

-- Notifications: strictly personal.
create policy notifications_read on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

-- Audit trail: readable by auditors/admins only; nobody can write through the API.
create policy audit_logs_read on public.audit_logs for select to authenticated using (public.has_permission('audit.read'));

-- Imports
create policy import_batches_all on public.import_batches for all to authenticated
  using (public.has_permission('import.run')) with check (public.has_permission('import.run'));
create policy import_rows_all on public.import_rows for all to authenticated
  using (public.has_permission('import.run')) with check (public.has_permission('import.run'));

-- ---------------------------------------------------------------------------
-- 3. Private storage bucket and its policies
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('personnel-documents', 'personnel-documents', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false;

-- Upload only into your own folder (or any employee's folder for document.write).
create policy personnel_documents_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'personnel-documents'
    and public.can_upload_document_for(((storage.foldername(name))[1])::uuid)
  );
-- Read only objects that belong to a registered document version the caller may read.
create policy personnel_documents_select on storage.objects for select to authenticated
  using (
    bucket_id = 'personnel-documents'
    and exists (
      select 1 from public.document_versions v
      where v.storage_path = storage.objects.name and public.can_read_document(v.document_id)
    )
  );
-- No update/delete policies: stored files are immutable.

-- ---------------------------------------------------------------------------
-- 4. Administration functions (role / user management)
-- ---------------------------------------------------------------------------
create function public.assignable_staff() returns table (user_id uuid, display_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_permission('request.process') then
    raise exception 'Not authorized' using errcode = '42501', hint = 'user';
  end if;
  return query
    select p.user_id, p.display_name from public.profiles p
    where p.user_id in (select public.users_with_permission('request.process')) order by p.display_name;
end $$;

create function public.admin_remaining_super_admins(p_excluding uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.profiles p
  join public.user_roles ur on ur.user_id = p.user_id
  join public.roles r on r.id = ur.role_id and r.code = 'SUPER_ADMIN'
  where p.is_active and p.user_id <> p_excluding
$$;

create function public.admin_set_user_roles(p_user uuid, p_role_codes text[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_super boolean := public.has_role('SUPER_ADMIN');
  v_ids uuid[];
begin
  if not public.has_permission('admin.users') then
    raise exception 'Not authorized' using errcode = '42501', hint = 'user';
  end if;
  if p_user = auth.uid() then
    raise exception 'You cannot change your own roles' using errcode = '42501', hint = 'user';
  end if;
  select array_agg(id) into v_ids from public.roles where code = any (p_role_codes);
  if coalesce(array_length(v_ids, 1), 0) <> coalesce(array_length(p_role_codes, 1), 0) then
    raise exception 'Unknown role' using errcode = '22023', hint = 'user';
  end if;
  if not v_super and (
       'SUPER_ADMIN' = any (p_role_codes)
       or exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
                  where ur.user_id = p_user and r.code = 'SUPER_ADMIN')) then
    raise exception 'Only a super administrator may change super administrator access' using errcode = '42501', hint = 'user';
  end if;
  if not ('SUPER_ADMIN' = any (p_role_codes))
     and exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
                 where ur.user_id = p_user and r.code = 'SUPER_ADMIN')
     and public.admin_remaining_super_admins(p_user) = 0 then
    raise exception 'At least one active super administrator is required' using errcode = '22023', hint = 'user';
  end if;
  delete from public.user_roles where user_id = p_user and role_id <> all (coalesce(v_ids, '{}'));
  insert into public.user_roles (user_id, role_id)
    select p_user, id from unnest(coalesce(v_ids, '{}')) id
    on conflict do nothing;
end $$;

create function public.admin_provision_user(
  p_user_id uuid, p_display_name text, p_employee_id uuid, p_role_codes text[]
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('admin.users') then
    raise exception 'Not authorized' using errcode = '42501', hint = 'user';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Authentication account does not exist' using errcode = '22023', hint = 'user';
  end if;
  insert into public.profiles (user_id, display_name, employee_id)
  values (p_user_id, p_display_name, p_employee_id)
  on conflict (user_id) do update
    set display_name = excluded.display_name, employee_id = excluded.employee_id;
  if p_user_id <> auth.uid() then
    perform public.admin_set_user_roles(p_user_id, p_role_codes);
  end if;
end $$;

create function public.admin_set_user_active(p_user uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('admin.users') then
    raise exception 'Not authorized' using errcode = '42501', hint = 'user';
  end if;
  if p_user = auth.uid() and not p_active then
    raise exception 'You cannot deactivate your own account' using errcode = '42501', hint = 'user';
  end if;
  if not p_active and exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
                              where ur.user_id = p_user and r.code = 'SUPER_ADMIN')
     and public.admin_remaining_super_admins(p_user) = 0 then
    raise exception 'At least one active super administrator is required' using errcode = '22023', hint = 'user';
  end if;
  update public.profiles set is_active = p_active where user_id = p_user;
end $$;

-- Create or edit a role. SUPER_ADMIN always holds every permission and cannot
-- be edited. Callers can only grant permissions they hold themselves.
create function public.admin_save_role(
  p_role_id uuid, p_code text, p_name text, p_description text, p_permission_codes text[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := p_role_id;
  r public.roles;
  v_perm text;
begin
  if not public.has_permission('admin.roles') then
    raise exception 'Not authorized' using errcode = '42501', hint = 'user';
  end if;
  if v_id is not null then
    select * into r from public.roles where id = v_id;
    if not found then
      raise exception 'Role not found' using errcode = 'P0002', hint = 'user';
    end if;
    if r.code = 'SUPER_ADMIN' then
      raise exception 'The super administrator role cannot be edited' using errcode = '42501', hint = 'user';
    end if;
    update public.roles set name = p_name, description = p_description where id = v_id;
  else
    if p_code !~ '^[A-Z][A-Z0-9_]{2,40}$' or p_code = 'SUPER_ADMIN' then
      raise exception 'Invalid role code' using errcode = '22023', hint = 'user';
    end if;
    insert into public.roles (code, name, description) values (p_code, p_name, p_description) returning id into v_id;
  end if;
  foreach v_perm in array coalesce(p_permission_codes, '{}') loop
    if not exists (select 1 from public.permissions where code = v_perm) then
      raise exception 'Unknown permission %', v_perm using errcode = '22023', hint = 'user';
    end if;
    if not public.has_permission(v_perm) then
      raise exception 'You cannot grant a permission you do not hold' using errcode = '42501', hint = 'user';
    end if;
  end loop;
  delete from public.role_permissions where role_id = v_id and permission_code <> all (coalesce(p_permission_codes, '{}'));
  insert into public.role_permissions (role_id, permission_code)
    select v_id, p from unnest(coalesce(p_permission_codes, '{}')) p on conflict do nothing;
  return v_id;
end $$;

grant execute on function
  public.assignable_staff(), public.admin_set_user_roles(uuid, text[]),
  public.admin_provision_user(uuid, text, uuid, text[]), public.admin_set_user_active(uuid, boolean),
  public.admin_save_role(uuid, text, text, text, text[])
  to authenticated;
