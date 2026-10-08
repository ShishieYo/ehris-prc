\set ON_ERROR_STOP on
set client_min_messages = notice;
begin;

do $$
declare juan uuid := t.emp('DEMO-0005'); n int;
begin
  -- employee update is captured with before/after and reason
  perform t.as_user('paolo.mercado@demo.prc3.example');
  perform public.hr_save_employee(juan, '{"salary_step": 4, "position_number": "PN-77"}', '{"tin": "123456789"}', 'Step increment');
  perform t.as_user('eduardo.pascual@demo.prc3.example');
  perform t.ok((select (old_values ->> 'salary_step') = '2' and (new_values ->> 'salary_step') = '4' and reason = 'Step increment'
                  and actor_label = 'Paolo D. Mercado'
                from public.audit_logs where action = 'employees.update' and subject_employee_id = juan order by id desc limit 1),
               'employee change logged with old/new value, actor and reason');
  perform t.ok((select new_values ->> 'tin' from public.audit_logs where action = 'employee_private.update' and subject_employee_id = juan order by id desc limit 1) = '[redacted]',
               'government identifiers are masked in the audit trail');
  perform t.ok(not exists (select 1 from public.audit_logs where new_values::text like '%123456789%' or old_values::text like '%9000000%'),
               'no raw government identifier appears anywhere in the audit trail');

  -- change history function (HR view)
  perform t.as_user('paolo.mercado@demo.prc3.example');
  perform t.ok(exists (select 1 from public.employee_change_history(juan) h
                       where h.field = 'salary_step' and h.old_value = '2' and h.new_value = '4' and h.reason = 'Step increment' and h.changed_by = 'Paolo D. Mercado'),
               'employee change history shows field, previous, new, who, reason');
  perform t.ok(exists (select 1 from public.employee_change_history(juan) h where h.field = 'tin' and h.new_value = '[redacted]'),
               'change history never reveals identifier values');

  -- explicit business events are allow-listed
  perform t.as_user('juan.delacruz@demo.prc3.example');
  perform public.log_event('auth.login', 'access');
  perform t.fails($q$select public.log_event('employees.update', 'employee')$q$, 'arbitrary audit actions cannot be injected', '22023');
  perform t.as_anon();
  perform t.fails($q$select public.log_event('auth.login', 'access')$q$, 'anonymous callers cannot write audit events');
  perform t.as_user('eduardo.pascual@demo.prc3.example');
  perform t.ok(exists (select 1 from public.audit_logs where action = 'auth.login' and actor_label = 'Juan Dela Cruz'), 'login event recorded');

  -- role changes are audited
  perform t.as_user('admin@demo.prc3.example');
  perform public.admin_set_user_roles(t.uid('paolo.mercado@demo.prc3.example'), array['HR_STAFF', 'EMPLOYEE', 'AUDITOR']);
  perform t.as_user('eduardo.pascual@demo.prc3.example');
  perform t.ok(exists (select 1 from public.audit_logs where action = 'user_roles.insert' and module = 'access' and actor_label = 'System Administrator (DEMO)'),
               'role assignment audited');
  perform t.as_user('admin@demo.prc3.example');
  perform public.admin_set_user_roles(t.uid('paolo.mercado@demo.prc3.example'), array['HR_STAFF', 'EMPLOYEE']);
  perform t.as_user('eduardo.pascual@demo.prc3.example');
  perform t.ok(exists (select 1 from public.audit_logs where action = 'user_roles.delete' and module = 'access'), 'role removal audited');

  -- immutability, even for privileged sessions
  perform t.as_admin();
  perform t.fails($q$update public.audit_logs set action = 'x'$q$, 'audit rows cannot be updated (superuser)', '42501');
  perform t.fails($q$delete from public.audit_logs$q$, 'audit rows cannot be deleted (superuser)', '42501');
  perform t.fails($q$truncate public.audit_logs$q$, 'audit table cannot be truncated', '42501');

  -- optional network metadata (disabled by default, enabled by setting)
  perform t.as_user('paolo.mercado@demo.prc3.example');
  perform set_config('request.headers', '{"x-client-ip":"203.0.113.9","x-client-ua":"TestAgent/1.0"}', true);
  perform public.hr_save_employee(juan, '{"salary_step": 5}', '{}', 'no metadata test');
  perform t.as_admin();
  perform t.ok((select metadata = '{}'::jsonb from public.audit_logs where reason = 'no metadata test' order by id desc limit 1),
               'IP/device metadata is NOT captured while the setting is off');
  update public.system_settings set value = 'true' where key = 'audit.capture_network_metadata';
  perform t.as_user('paolo.mercado@demo.prc3.example');
  perform set_config('request.headers', '{"x-client-ip":"203.0.113.9","x-client-ua":"TestAgent/1.0"}', true);
  perform public.hr_save_employee(juan, '{"salary_step": 6}', '{}', 'metadata test');
  perform t.as_admin();
  perform t.ok((select metadata ->> 'client_ip' = '203.0.113.9' and metadata ->> 'user_agent' = 'TestAgent/1.0'
                from public.audit_logs where reason = 'metadata test' and action = 'employees.update' order by id desc limit 1),
               'IP/device metadata captured once enabled by the agency');
end $$;

rollback;
select 'Audit tests passed' as result;
