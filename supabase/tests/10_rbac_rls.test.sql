\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;

begin;
-- ===== anonymous =====
select t.as_anon();
select t.fails('select count(*) from public.employees', 'anon cannot read employees', '42501');
select t.fails('select public.has_permission(''audit.read'')', 'anon cannot call RPC helpers', '42501');
select t.fails('select * from public.audit_logs', 'anon cannot read audit logs', '42501');
select t.as_admin();

-- ===== employee (Juan) =====
select t.as_user('juan.delacruz@demo.prc3.example');
select t.ok(t.count('select 1 from public.employees') = 1, 'employee sees only own employee row');
select t.ok(t.count('select 1 from public.employee_directory') = 1, 'directory view is RLS-filtered for employee');
select t.ok(t.count('select 1 from public.search_employees(''a'')') <= 1, 'search cannot enumerate personnel');
select t.ok(t.count('select 1 from public.employee_private') = 1, 'employee sees only own private data');
select t.ok(t.count('select 1 from public.employee_private where employee_id = t.emp(''DEMO-0006'')') = 0, 'cannot read colleague private data (IDOR)');
select t.ok(t.count('select 1 from public.employees where id = t.emp(''DEMO-0006'')') = 0, 'cannot fetch colleague by id (IDOR)');
select t.ok(t.count('select 1 from public.service_records') = 2, 'employee sees own service record (2 entries)');
select t.ok(t.count('select 1 from public.employee_family') = 2, 'employee sees own PDS family rows only');
select t.ok(t.count('select 1 from public.attendance_records where employee_id <> t.emp(''DEMO-0005'')') = 0, 'cannot read others attendance');
select t.fails('update public.employees set salary_grade = 30', 'employee cannot update employees directly', '42501');
select t.fails('insert into public.employees (first_name, last_name) values (''X'', ''Y'')', 'employee cannot insert employees', '42501');
select t.fails($$select public.hr_save_employee(t.emp('DEMO-0005'), '{"salary_grade": 30}', '{}', 'self promote')$$, 'employee cannot use HR save function', '42501');
select t.fails('insert into public.audit_logs (actor_label, action, module) values (''x'', ''x'', ''x'')', 'employee cannot write audit logs', '42501');
select t.fails($$select public.notify(auth.uid(), 'x', 'forged')$$, 'internal notify() is not callable', '42501');
select t.fails($$select public.next_number('HR')$$, 'internal next_number() is not callable', '42501');
select t.fails($$select public.wf_log('hr_request', gen_random_uuid(), 1, 'x', 'comment', 'x', null, null)$$, 'internal wf_log() is not callable', '42501');
select t.ok(t.count('select 1 from public.audit_logs') = 0, 'employee sees no audit logs');
select t.fails($$select public.admin_save_role(null, 'HACK', 'x', 'x', array['audit.read'])$$, 'employee cannot create roles', '42501');
select t.fails($$select * from public.dashboard_hr()$$, 'employee cannot open HR dashboard', '42501');
select t.fails($$select * from public.data_quality_report()$$, 'employee cannot read data quality report', '42501');
select t.fails($$select * from public.report_plantilla_summary()$$, 'employee cannot run reports', '42501');
select t.fails($$select * from public.employee_change_history(t.emp('DEMO-0005'))$$, 'employee cannot read change history', '42501');
select t.fails($$select public.pds_review(t.emp('DEMO-0005'), 'verified', null)$$, 'employee cannot verify own PDS', '42501');
-- allowed self-service
select public.update_my_contact('juan.new@demo.example', '09171234567');
select t.ok((select mobile_no from public.employee_private) = '09171234567', 'employee can update own contact details');
select t.fails($$select public.update_my_contact('not-an-email', '09171234567')$$, 'invalid email rejected', '23514');
select t.fails($$select public.update_my_contact('a@b.example', 'abc')$$, 'invalid phone rejected', '23514');
select t.affects($$insert into public.employee_education (employee_id, level, school) values (t.emp('DEMO-0005'), 'graduate', 'Demo Grad School')$$, 1, 'employee can add own PDS row');
select t.fails($$insert into public.employee_education (employee_id, level, school) values (t.emp('DEMO-0006'), 'graduate', 'Evil')$$, 'employee cannot add PDS row for someone else');
select t.affects($$delete from public.employee_education where employee_id = t.emp('DEMO-0006')$$, 0, 'employee cannot delete colleague PDS rows');
select t.as_admin();

-- ===== supervisor (Lorna: heads Licensure and Registration Division) =====
select t.as_user('lorna.dizon@demo.prc3.example');
select t.ok(t.count('select 1 from public.employees') = 5, 'supervisor sees self + 4 team members only');
select t.ok(t.count('select 1 from public.employees where id = t.emp(''DEMO-0003'')') = 0, 'supervisor cannot see employees outside her division');
select t.ok(t.count('select 1 from public.employee_private where employee_id <> t.emp(''DEMO-0004'')') = 0, 'supervisor cannot see team private data');
select t.ok(t.count('select 1 from public.service_records where employee_id = t.emp(''DEMO-0005'')') = 0, 'supervisor cannot see team service records (salary)');
select t.ok(t.count('select 1 from public.employee_family where employee_id = t.emp(''DEMO-0005'')') = 0, 'supervisor cannot see team PDS');
select t.ok(t.count('select 1 from public.attendance_records where employee_id = t.emp(''DEMO-0005'')') > 0, 'supervisor can see team attendance');
select t.ok(t.count('select 1 from public.attendance_records where employee_id = t.emp(''DEMO-0003'')') = 0, 'supervisor cannot see other division attendance');
select t.fails($$select * from public.dashboard_hr()$$, 'supervisor cannot open HR dashboard', '42501');
select t.as_admin();

-- ===== HR staff (Paolo) =====
select t.as_user('paolo.mercado@demo.prc3.example');
select t.ok(t.count('select 1 from public.employees') = 14, 'HR staff sees all employees');
select t.ok(t.count('select 1 from public.employee_private') = 14, 'HR staff sees private data (read_sensitive)');
select t.ok(t.count('select 1 from public.audit_logs') = 0, 'HR staff cannot read audit logs');
select t.fails($$select public.hr_save_employee(t.emp('DEMO-0005'), '{"record_status": "separated"}', '{}', 'x')$$, 'HR staff cannot change record status', '42501');
select t.fails($$select public.hr_save_employee(t.emp('DEMO-0005'), '{"salary_step": 3}', '{}', '')$$, 'a reason is required for changes', '22023');
select public.hr_save_employee(t.emp('DEMO-0005'), '{"salary_step": 3}', '{}', 'Step increment (test)');
select t.ok((select salary_step from public.employees where id = t.emp('DEMO-0005')) = 3, 'HR staff can update employee data with a reason');
select t.fails($$select public.hr_save_employee(t.emp('DEMO-0005'), '{"id": "00000000-0000-0000-0000-000000000000"}', '{}', 'x')$$, 'unknown/immutable fields rejected', '22023');
select t.fails($$insert into public.service_records (employee_id, date_from, position_title) values (t.emp('DEMO-0003'), '2030-01-01', 'x')$$, 'HR staff cannot write service records');
select t.fails($$select public.delete_document(gen_random_uuid(), 'x')$$, 'HR staff cannot delete documents', '42501');
select t.fails($$select public.admin_set_user_roles(auth.uid(), array['SUPER_ADMIN'])$$, 'HR staff cannot manage users', '42501');
select t.fails($$select public.commit_employee_import(gen_random_uuid())$$, 'HR staff cannot run imports', '42501');
select t.affects($$update public.system_settings set value = 'true' where key = 'audit.capture_network_metadata'$$, 0, 'HR staff cannot change system settings');
select t.as_admin();

-- ===== HR admin (Teresita) =====
select t.as_user('teresita.navarro@demo.prc3.example');
select public.hr_save_employee(t.emp('DEMO-0010'), '{"employment_status_code": "COS"}', '{}', 'Reclassified (test)');
select t.ok((select employment_status_code from public.employees where id = t.emp('DEMO-0010')) = 'COS', 'HR admin can change employment status');
select t.fails($$select public.admin_save_role(null, 'HACK', 'x', 'x', array['audit.read'])$$, 'HR admin cannot manage roles', '42501');
select t.ok(t.count('select 1 from public.audit_logs') = 0, 'HR admin cannot read audit logs (separation of duties)');
select t.ok(((select public.dashboard_hr()) -> 'total')::int = 14, 'HR admin can open the HR dashboard');
select t.as_admin();

-- ===== auditor (Eduardo) =====
select t.as_user('eduardo.pascual@demo.prc3.example');
select t.ok(t.count('select 1 from public.employees') = 14, 'auditor can view employee records');
select t.ok(t.count('select 1 from public.employee_private where employee_id <> t.emp(''DEMO-0007'')') = 0, 'auditor cannot view sensitive identifiers');
select t.ok(t.count('select 1 from public.audit_logs') > 0, 'auditor can read audit logs');
select t.fails($$select public.hr_save_employee(t.emp('DEMO-0005'), '{"salary_step": 4}', '{}', 'x')$$, 'auditor cannot modify employees', '42501');
select t.fails($$insert into public.service_records (employee_id, date_from, position_title) values (t.emp('DEMO-0003'), '2030-01-01', 'x')$$, 'auditor cannot write service records');
select t.fails($$insert into public.attendance_records (employee_id, work_date, status_code) values (t.emp('DEMO-0003'), '2030-01-01', 'PRESENT')$$, 'auditor cannot write attendance');
select t.fails($$update public.audit_logs set action = 'tampered'$$, 'auditor cannot alter audit logs', '42501');
select t.fails($$delete from public.audit_logs$$, 'auditor cannot delete audit logs', '42501');
select t.ok(t.count('select 1 from public.report_attendance_summary(current_date - 7, current_date)') > 0, 'auditor can run reports');
select t.ok(t.count('select 1 from public.documents') = 0, 'auditor sees no personnel files by default');
select t.as_admin();

-- ===== executive (Ricardo) =====
select t.as_user('ricardo.villanueva@demo.prc3.example');
select t.ok(((select public.dashboard_executive()) -> 'total')::int = 14, 'executive dashboard works');
select t.ok(not ((select public.dashboard_executive())::text like '%birth%'), 'executive dashboard exposes no personal data fields');
select t.fails($$select * from public.dashboard_hr()$$, 'executive cannot open the HR dashboard', '42501');
select t.ok(t.count('select 1 from public.employee_private where employee_id <> t.emp(''DEMO-0001'')') = 0, 'executive cannot see private identifiers');
select t.as_admin();

-- ===== administration safeguards =====
select t.as_user('admin@demo.prc3.example');
select t.fails($$select public.admin_set_user_roles(auth.uid(), array['EMPLOYEE'])$$, 'cannot change own roles', '42501');
select t.fails($$select public.admin_set_user_active(auth.uid(), false)$$, 'cannot deactivate self', '42501');
select t.as_admin();
-- A role manager may not grant permissions they do not hold.
insert into public.roles (code, name) values ('ROLE_MANAGER', 'Role manager (test)');
insert into public.role_permissions select r.id, 'admin.roles' from public.roles r where r.code = 'ROLE_MANAGER';
insert into public.user_roles select t.uid('paolo.mercado@demo.prc3.example'), r.id from public.roles r where r.code = 'ROLE_MANAGER';
select t.as_user('paolo.mercado@demo.prc3.example');
select t.fails($$select public.admin_save_role(null, 'ESCALATE', 'x', 'x', array['admin.users'])$$, 'role manager cannot grant permissions they do not hold', '42501');
select public.admin_save_role(null, 'SAFE_ROLE', 'Safe', 'x', array['request.read_all']);
select t.ok(exists (select 1 from public.roles where code = 'SAFE_ROLE'), 'role manager can create roles within own permissions');
select t.fails($$select public.admin_save_role((select id from public.roles where code = 'SUPER_ADMIN'), 'SUPER_ADMIN', 'x', 'x', array[]::text[])$$, 'super admin role is not editable', '42501');
select t.as_admin();
delete from public.user_roles where role_id in (select id from public.roles where code = 'ROLE_MANAGER');
delete from public.roles where code in ('ROLE_MANAGER', 'SAFE_ROLE');

-- ===== deactivated accounts lose all access =====
update public.profiles set is_active = false where user_id = t.uid('analiza.bautista@demo.prc3.example');
select t.as_user('analiza.bautista@demo.prc3.example');
select t.ok(t.count('select 1 from public.employees') = 0, 'deactivated user sees nothing');
select t.as_admin();
update public.profiles set is_active = true where user_id = t.uid('analiza.bautista@demo.prc3.example');
rollback;
select 'RBAC/RLS tests passed' as result;
