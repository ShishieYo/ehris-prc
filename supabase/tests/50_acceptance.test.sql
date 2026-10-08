\set ON_ERROR_STOP on
set client_min_messages = notice;
begin;

do $$
declare
  juan uuid := t.emp('DEMO-0005');
  v_start bigint := (select coalesce(max(id), 0) from public.audit_logs);
  v_date date; v_req uuid; v_no text; v_doc uuid; v_path text; v jsonb; r record; n int;
begin
  raise notice '--- STEP 1: Juan Dela Cruz logs in and sees his dashboard';
  perform t.as_user('juan.delacruz@demo.prc3.example');
  perform public.log_event('auth.login', 'access');
  v := public.profile_completion(juan);
  raise notice '    profile completion: % percent', v ->> 'percent';
  for r in select leave_type_code, available from public.leave_balance_summary order by 1 loop
    raise notice '    leave balance %: % available', r.leave_type_code, r.available;
  end loop;
  select work_date into v_date from public.attendance_records where status_code = 'MISSING_LOG';
  raise notice '    attendance alert: missing log on %', v_date;
  perform t.ok(v_date is not null, 'dashboard surfaces the missing attendance log');

  raise notice '--- STEP 2: views his PDS';
  perform public.log_event('pds.viewed', 'pds', 'employees', juan::text, juan);
  perform t.ok((select count(*) from public.employee_education) >= 3 and (select count(*) from public.employee_family) = 2 and (select count(*) from public.employee_references) = 3, 'PDS sections load for the owner');

  raise notice '--- STEP 3: views his service record';
  select count(*) into n from public.service_records;
  perform t.ok(n = 2 and (select position_title from public.current_service_record) = 'Professional Regulation Officer I', 'service record shows history and derives the current position');

  raise notice '--- STEP 4: uploads a personnel document';
  v_path := juan || '/training-cert.pdf';
  insert into storage.objects (bucket_id, name) values ('personnel-documents', v_path);
  v_doc := public.create_document(juan, 'TRAINING_CERT', 'Customer Service Excellence certificate', current_date - 400, 'Demo Training Institute',
                                  null, null, null, null, v_path, 'certificate.pdf', 'application/pdf', 20480, repeat('9', 64));
  perform public.log_event('document.viewed', 'document', 'documents', v_doc::text, juan);
  perform t.ok((select status from public.documents where id = v_doc) = 'for_review', 'document stored privately, awaiting HR review');

  raise notice '--- STEP 5: submits an attendance correction with a supporting file';
  insert into public.attendance_corrections (employee_id, work_date, correction_type, proposed_time_out, reason, remarks)
    values (juan, v_date, 'missing_time_out', (v_date + time '17:05') at time zone 'Asia/Manila', 'Forgot to tap out; left after the 5 PM flag ceremony', 'Supervisor was present')
    returning id, request_no into v_req, v_no;
  v_path := juan || '/ob-form.pdf';
  insert into storage.objects (bucket_id, name) values ('personnel-documents', v_path);
  perform public.create_document(juan, 'SUPPORTING', 'Division logbook page', v_date, null, null, null,
                                 'attendance_correction', v_req, v_path, 'logbook.pdf', 'application/pdf', 1024, repeat('8', 64));
  perform public.wf_submit('attendance_correction', v_req);
  raise notice '    submitted %', v_no;

  raise notice '--- STEP 6: supervisor logs in, sees the request and approves it';
  perform t.as_user('lorna.dizon@demo.prc3.example');
  perform public.log_event('auth.login', 'access');
  select * into r from public.my_pending_actions() where entity_id = v_req;
  raise notice '    inbox: % | % | % | %', r.request_no, r.employee_name, r.summary, r.step_name;
  perform t.ok(r.entity_id is not null, 'supervisor sees the request');
  perform t.ok(t.count(format('select 1 from public.documents where related_entity_id = %L', v_req)) = 1, 'supervisor can open the supporting file');
  perform public.wf_act('attendance_correction', v_req, 'approve', 'Confirmed; I was present at the flag ceremony');

  raise notice '--- STEP 7: HR logs in, sees the approved request and processes it';
  perform t.as_user('paolo.mercado@demo.prc3.example');
  perform public.log_event('auth.login', 'access');
  select * into r from public.my_pending_actions() where entity_id = v_req;
  raise notice '    inbox: % | % | %', r.request_no, r.employee_name, r.step_name;
  perform t.ok(r.step_name = 'For HR Finalization', 'HR sees the supervisor-approved request');
  perform public.wf_act('attendance_correction', v_req, 'approve', 'DTR updated');

  raise notice '--- STEP 8: Juan sees the outcome on his dashboard';
  perform t.as_user('juan.delacruz@demo.prc3.example');
  select status into r from public.attendance_corrections where id = v_req;
  raise notice '    request % status: % (shown to the employee as "Approved - DTR updated")', v_no, r.status;
  perform t.ok(r.status = 'completed', 'request finished: approved and applied');
  perform t.ok((select status_code from public.attendance_records where work_date = v_date) = 'PRESENT', 'his DTR no longer shows a missing log');
  perform t.ok(t.count('select 1 from public.notifications where read_at is null and entity_id = ''' || v_req || '''') >= 2, 'he received notifications for each step');
  for r in select created_at, step_name, action, actor_name, remarks from public.workflow_actions where entity_id = v_req order by id loop
    raise notice '    timeline: % | % | % | %', r.action, coalesce(r.step_name, '-'), r.actor_name, coalesce(r.remarks, '');
  end loop;

  raise notice '--- STEP 9: the whole transaction appears in the audit trail';
  perform t.as_user('eduardo.pascual@demo.prc3.example');
  for r in select id, actor_label, action, module, entity_type,
                  coalesce(new_values ->> 'status', '') as status
           from public.audit_logs
           where id > v_start and (subject_employee_id = juan or action like 'auth.%' or action like 'workflow%')
           order by id loop
    raise notice '    audit #%: % | % |%', r.id, r.actor_label, r.action, case when r.status <> '' then ' -> ' || r.status else '' end;
  end loop;
  perform t.ok(exists (select 1 from public.audit_logs where id > v_start and action = 'auth.login' and actor_label = 'Juan Dela Cruz'), 'audit: Juan logged in');
  perform t.ok(exists (select 1 from public.audit_logs where id > v_start and action = 'pds.viewed'), 'audit: PDS viewed');
  perform t.ok(exists (select 1 from public.audit_logs where id > v_start and action = 'documents.insert' and subject_employee_id = juan), 'audit: document uploaded');
  perform t.ok(exists (select 1 from public.audit_logs where id > v_start and action = 'document.viewed'), 'audit: document viewed');
  perform t.ok(exists (select 1 from public.audit_logs where id > v_start and entity_id = v_req::text and action = 'attendance_corrections.insert'), 'audit: correction created');
  perform t.ok((select count(*) from public.audit_logs where id > v_start and entity_id = v_req::text and action = 'attendance_corrections.update'
                  and new_values ? 'status') >= 3, 'audit: submission, supervisor approval and HR finalization status changes');
  perform t.ok(exists (select 1 from public.audit_logs where id > v_start and entity_type = 'attendance_records' and subject_employee_id = juan), 'audit: attendance record modified');
  perform t.ok(exists (select 1 from public.audit_logs where id > v_start and action = 'auth.login' and actor_label = 'Lorna P. Dizon'), 'audit: supervisor logged in');
  perform t.ok(exists (select 1 from public.audit_logs where id > v_start and action = 'auth.login' and actor_label = 'Paolo D. Mercado'), 'audit: HR logged in');

  raise notice '--- STEP 10: another employee cannot access Juan''s records';
  perform t.as_user('analiza.bautista@demo.prc3.example');
  perform t.ok(t.count(format('select 1 from public.employees where id = %L', juan)) = 0, 'cannot open his employee record');
  perform t.ok(t.count(format('select 1 from public.employee_private where employee_id = %L', juan)) = 0, 'cannot read his personal/government data');
  perform t.ok(t.count(format('select 1 from public.employee_education where employee_id = %L', juan)) = 0, 'cannot read his PDS');
  perform t.ok(t.count(format('select 1 from public.service_records where employee_id = %L', juan)) = 0, 'cannot read his service record');
  perform t.ok(t.count(format('select 1 from public.attendance_records where employee_id = %L', juan)) = 0, 'cannot read his attendance');
  perform t.ok(t.count(format('select 1 from public.attendance_corrections where id = %L', v_req)) = 0, 'cannot read his requests');
  perform t.ok(t.count(format('select 1 from public.workflow_actions where entity_id = %L', v_req)) = 0, 'cannot read his request timeline');
  perform t.ok(t.count(format('select 1 from public.documents where employee_id = %L', juan)) = 0, 'cannot list his documents');
  perform t.ok(t.count(format('select 1 from storage.objects where name like %L', juan || '/%')) = 0, 'cannot download his files (storage)');
  perform t.ok(t.count('select 1 from public.notifications where entity_id = ''' || v_req || '''') = 0, 'cannot read his notifications');
  perform t.fails(format('select public.profile_completion(%L)', juan), 'cannot compute his profile summary', '42501');
  perform t.fails(format('select public.wf_act(''attendance_correction'', %L, ''reject'', ''x'')', v_req), 'cannot act on his requests');
  perform t.fails(format('insert into public.leave_applications (employee_id, leave_type_code, date_from, date_to) values (%L, ''VL'', current_date, current_date)', juan),
                  'cannot file requests in his name');
  perform t.as_admin();
end $$;

rollback;
select 'ACCEPTANCE SCENARIO PASSED' as result;
