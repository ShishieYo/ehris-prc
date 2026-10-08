\set ON_ERROR_STOP on
set client_min_messages = notice;
begin;

-- ===== Attendance correction: Employee -> Supervisor -> HR =====
do $$
declare
  v_date date; v_id uuid; v_no text; v_other uuid; v_ts timestamptz;
begin
  select work_date into v_date from public.attendance_records
   where employee_id = t.emp('DEMO-0005') and status_code = 'MISSING_LOG';
  perform t.ok(v_date is not null, 'demo data contains a missing-log day for Juan');

  perform t.as_user('juan.delacruz@demo.prc3.example');
  insert into public.attendance_corrections (employee_id, work_date, correction_type, proposed_time_out, reason, request_no, status)
  values (t.emp('DEMO-0005'), v_date, 'missing_time_out', (v_date + time '17:03') at time zone 'Asia/Manila',
          'Forgot to tap out', 'FORGED-1', 'approved')
  returning id, request_no into v_id, v_no;
  perform t.ok(v_no ~ '^AC-[0-9]{4}-[0-9]{6}$', 'request number is system generated (' || v_no || ')');
  perform t.ok((select status from public.attendance_corrections where id = v_id) = 'draft', 'client cannot start a request in a non-draft state');
  perform t.fails(format('update public.attendance_corrections set status = ''approved'' where id = %L', v_id), 'employee cannot approve own request by editing status', '42501');
  perform t.fails(format('update public.attendance_corrections set current_step_order = 2 where id = %L', v_id), 'employee cannot skip workflow steps', '42501');
  perform t.fails(format('select public.wf_act(''attendance_correction'', %L, ''approve'')', v_id), 'a draft cannot be approved', '22023');
  perform t.fails(format('insert into public.attendance_corrections (employee_id, work_date, correction_type, reason) values (%L, %L, ''missing_time_out'', ''dup'')', t.emp('DEMO-0005'), v_date), 'duplicate open correction blocked', '23505');

  perform public.wf_submit('attendance_correction', v_id);
  perform t.ok((select status from public.attendance_corrections where id = v_id) = 'in_review', 'submitted request is in review');
  perform t.fails(format('select public.wf_submit(''attendance_correction'', %L)', v_id), 'cannot submit twice', '22023');
  perform t.affects(format('update public.attendance_corrections set reason = ''edited after submit'' where id = %L', v_id), 0, 'request cannot be edited after submission');
  perform t.fails(format('select public.wf_act(''attendance_correction'', %L, ''approve'')', v_id), 'requester cannot approve own request', '42501');

  -- strangers cannot act or even see it
  perform t.as_user('analiza.bautista@demo.prc3.example');
  perform t.ok(t.count(format('select 1 from public.attendance_corrections where id = %L', v_id)) = 0, 'colleague cannot see the request');
  perform t.ok(t.count(format('select 1 from public.workflow_actions where entity_id = %L', v_id)) = 0, 'colleague cannot see the timeline');
  perform t.fails(format('select public.wf_act(''attendance_correction'', %L, ''approve'')', v_id), 'colleague cannot approve', '42501');
  perform t.fails(format('select public.wf_comment(''attendance_correction'', %L, ''hi'')', v_id), 'colleague cannot comment', '42501');

  -- HR cannot jump the supervisor step while a supervisor exists
  perform t.as_user('paolo.mercado@demo.prc3.example');
  perform t.fails(format('select public.wf_act(''attendance_correction'', %L, ''approve'')', v_id), 'HR cannot bypass the supervisor step', '42501');

  -- supervisor: sees it in the inbox; reject needs remarks
  perform t.as_user('lorna.dizon@demo.prc3.example');
  perform t.ok(t.count(format('select 1 from public.my_pending_actions() where entity_id = %L', v_id)) = 1, 'supervisor sees it in the action inbox');
  perform t.ok(t.count(format('select 1 from public.notifications where entity_id = %L and type = ''action_required''', v_id)) = 1, 'supervisor was notified');
  perform t.fails(format('select public.wf_act(''attendance_correction'', %L, ''reject'')', v_id), 'rejection requires remarks', '22023');
  perform public.wf_act('attendance_correction', v_id, 'approve', 'Verified with biometric logs');
  perform t.ok((select status from public.attendance_corrections where id = v_id) = 'approved', 'supervisor approval -> Approved');
  perform t.ok((select current_step_order from public.attendance_corrections where id = v_id) = 2, 'now waiting for HR finalization');
  perform t.fails(format('select public.wf_act(''attendance_correction'', %L, ''approve'')', v_id), 'supervisor cannot also finalize as HR', '42501');

  -- employee sees Approved
  perform t.as_user('juan.delacruz@demo.prc3.example');
  perform t.ok((select status from public.attendance_corrections where id = v_id) = 'approved', 'employee sees Approved');
  perform t.ok(t.count('select 1 from public.notifications where title like ''AC-%'' and type = ''request_update''') >= 1, 'employee was notified');

  -- HR finalizes -> DTR updated
  perform t.as_user('paolo.mercado@demo.prc3.example');
  perform t.ok(t.count(format('select 1 from public.my_pending_actions() where entity_id = %L', v_id)) = 1, 'HR sees the approved request');
  perform public.wf_act('attendance_correction', v_id, 'approve', 'Applied to DTR');
  perform t.ok((select status from public.attendance_corrections where id = v_id) = 'completed', 'HR finalization -> Completed');
  select time_out, status_code into v_ts, v_no from public.attendance_records where employee_id = t.emp('DEMO-0005') and work_date = v_date;
  perform t.ok(v_ts is not null and v_no = 'PRESENT', 'DTR was corrected (time out set, status PRESENT)');
  perform t.ok((select total_minutes from public.attendance_records where employee_id = t.emp('DEMO-0005') and work_date = v_date) > 400, 'total hours computed');
  perform t.ok((select count(*) from public.workflow_actions where entity_id = v_id) = 3, 'timeline has 3 steps');
  perform t.ok((select string_agg(action, ',' order by id) from public.workflow_actions where entity_id = v_id) = 'submitted,approved,completed', 'timeline order is submitted,approved,completed');
  perform t.fails(format('select public.wf_act(''attendance_correction'', %L, ''cancel'')', v_id), 'completed requests cannot be cancelled', '22023');
  perform t.as_admin();
  perform t.fails(format('update public.workflow_actions set remarks = ''x'' where entity_id = %L', v_id), 'timeline is immutable even for admins', '42501');
end $$;

-- ===== Reject / return / cancel paths =====
do $$
declare v1 uuid; v2 uuid; v3 uuid; d date := current_date - 10;
begin
  perform t.as_user('juan.delacruz@demo.prc3.example');
  insert into public.attendance_corrections (employee_id, work_date, correction_type, proposed_time_in, reason)
    values (t.emp('DEMO-0005'), d, 'missing_time_in', (d + time '08:00') at time zone 'Asia/Manila', 'r1') returning id into v1;
  insert into public.attendance_corrections (employee_id, work_date, correction_type, proposed_time_in, reason)
    values (t.emp('DEMO-0005'), d - 1, 'missing_time_in', ((d - 1) + time '08:00') at time zone 'Asia/Manila', 'r2') returning id into v2;
  insert into public.attendance_corrections (employee_id, work_date, correction_type, reason)
    values (t.emp('DEMO-0005'), d - 2, 'missing_time_in', 'no time given') returning id into v3;
  perform t.fails(format('select public.wf_submit(''attendance_correction'', %L)', v3), 'submission requires the corrected time', '22023');
  perform public.wf_submit('attendance_correction', v1);
  perform public.wf_submit('attendance_correction', v2);

  perform t.as_user('lorna.dizon@demo.prc3.example');
  perform public.wf_act('attendance_correction', v1, 'reject', 'No supporting evidence');
  perform t.ok((select status from public.attendance_corrections where id = v1) = 'rejected', 'supervisor can reject with remarks');
  perform public.wf_act('attendance_correction', v2, 'return', 'Please attach a screenshot');
  perform t.ok((select status from public.attendance_corrections where id = v2) = 'draft', 'return sends the request back to draft');

  perform t.as_user('juan.delacruz@demo.prc3.example');
  perform t.fails(format('select public.wf_submit(''attendance_correction'', %L)', v1), 'rejected request cannot be resubmitted', '22023');
  perform public.wf_submit('attendance_correction', v2);
  perform public.wf_act('attendance_correction', v2, 'cancel', 'No longer needed');
  perform t.ok((select status from public.attendance_corrections where id = v2) = 'cancelled', 'requester can cancel an open request');
  perform t.ok((select string_agg(action, ',' order by id) from public.workflow_actions where entity_id = v2) = 'submitted,returned,submitted,cancelled', 'return/cancel are logged');
end $$;

-- ===== Leave: Employee -> Supervisor -> HR, with balances =====
do $$
declare v uuid; v_big uuid; v_overlap uuid; v_before numeric; d date := current_date + 14;
        yr int := extract(year from (current_date + 14))::int;
begin
  perform t.as_user('analiza.bautista@demo.prc3.example');
  select available into v_before from public.leave_balance_summary where leave_type_code = 'VL' and year = yr;
  perform t.ok(v_before > 0, 'employee sees VL balance (' || v_before || ' available)');

  insert into public.leave_applications (employee_id, leave_type_code, date_from, date_to, reason)
    values (t.emp('DEMO-0006'), 'VL', d, d + 4, 'Family event') returning id into v;
  perform t.ok((select days from public.leave_applications where id = v) between 1 and 5, 'days default to working days');
  insert into public.leave_applications (employee_id, leave_type_code, date_from, date_to, days)
    values (t.emp('DEMO-0006'), 'VL', d + 60, d + 160, 70) returning id into v_big;
  perform t.fails(format('select public.wf_submit(''leave_application'', %L)', v_big), 'cannot file beyond available balance', '22023');
  perform t.fails(format('insert into public.leave_applications (employee_id, leave_type_code, date_from, date_to, days) values (%L, ''VL'', %L, %L, 99)', t.emp('DEMO-0006'), d, d + 1), 'impossible number of days rejected', '22023');

  perform public.wf_submit('leave_application', v);
  perform t.ok((select pending from public.leave_balance_summary where leave_type_code = 'VL' and year = yr) > 0, 'pending days are reserved');
  perform t.ok((select available from public.leave_balance_summary where leave_type_code = 'VL' and year = yr) < v_before, 'available balance reflects pending');
  insert into public.leave_applications (employee_id, leave_type_code, date_from, date_to, days)
    values (t.emp('DEMO-0006'), 'SL', d + 1, d + 2, 1) returning id into v_overlap;
  perform t.fails(format('select public.wf_submit(''leave_application'', %L)', v_overlap), 'overlapping leave is rejected', '23P01');

  perform t.as_user('lorna.dizon@demo.prc3.example');
  perform public.wf_act('leave_application', v, 'approve', 'Endorsed');
  perform t.ok((select status from public.leave_applications where id = v) = 'in_review', 'after supervisor: still in review (HR processing)');
  perform t.ok((select (select name from public.workflow_steps s where s.workflow_code = l.workflow_code and s.step_order = l.current_step_order) from public.leave_applications l where id = v) = 'For HR Processing', 'step label is For HR Processing');

  perform t.as_user('paolo.mercado@demo.prc3.example');
  perform public.wf_act('leave_application', v, 'approve', 'Processed');
  perform t.ok((select status from public.leave_applications where id = v) = 'approved', 'HR processing -> Approved');
  perform t.as_user('analiza.bautista@demo.prc3.example');
  perform t.ok((select used from public.leave_balance_summary where leave_type_code = 'VL' and year = yr) > 0, 'approved leave is deducted from the balance');
  perform t.ok((select pending from public.leave_balance_summary where leave_type_code = 'VL' and year = yr) = 0, 'nothing pending after approval');
  perform t.fails(format('select public.wf_act(''leave_application'', %L, ''cancel'')', v), 'approved leave cannot be cancelled silently', '22023');
end $$;

-- ===== HR request: Employee -> HR Staff -> HR Approver -> Release (needs output document) =====
do $$
declare
  v uuid; v_att uuid; v_doc uuid; v_res uuid; v_emp uuid := t.emp('DEMO-0005'); v_path text;
begin
  perform t.as_user('juan.delacruz@demo.prc3.example');
  insert into public.hr_requests (employee_id, request_type_code, priority, subject, details)
    values (v_emp, 'COE', 'high', 'Certificate of Employment for visa', 'Needed by next week') returning id into v;
  insert into public.hr_requests (employee_id, request_type_code, subject)
    values (v_emp, 'PDS_UPDATE', 'Update civil status') returning id into v_att;
  perform t.ok((select request_no from public.hr_requests where id = v) ~ '^HR-[0-9]{4}-[0-9]{6}$', 'HR request number format');

  perform t.fails(format('select public.wf_submit(''hr_request'', %L)', v_att), 'attachment-required request type cannot be submitted bare', '22023');
  v_path := v_emp || '/support-1.pdf';
  insert into storage.objects (bucket_id, name) values ('personnel-documents', v_path);
  v_doc := public.create_document(v_emp, 'SUPPORTING', 'Marriage certificate scan', null, null, null, null,
                                  'hr_request', v_att, v_path, 'marriage.pdf', 'application/pdf', 1000, repeat('b', 64));
  perform public.wf_submit('hr_request', v_att);
  perform t.ok((select status from public.hr_requests where id = v_att) = 'in_review', 'request with attachment can be submitted');
  perform public.wf_submit('hr_request', v);

  perform t.as_user('paolo.mercado@demo.prc3.example');
  perform t.ok(t.count(format('select 1 from public.documents where related_entity_id = %L', v_att)) = 1, 'HR can open the supporting document');
  perform public.hr_request_assign(v, t.uid('teresita.navarro@demo.prc3.example'));
  perform t.fails(format('select public.hr_request_assign(%L, %L)', v, t.uid('juan.delacruz@demo.prc3.example')), 'cannot assign to someone without HR processing rights', '22023');
  perform public.wf_act('hr_request', v, 'approve', 'Records verified');
  perform t.fails(format('select public.wf_act(''hr_request'', %L, ''approve'')', v), 'HR staff cannot approve at the approval step', '42501');

  perform t.as_user('teresita.navarro@demo.prc3.example');
  perform t.ok(t.count('select 1 from public.notifications where type = ''action_required'' and title like ''Assigned to you%''') = 1, 'assignee notified');
  perform public.wf_act('hr_request', v, 'approve', 'Approved for release');
  perform t.ok((select status from public.hr_requests where id = v) = 'approved', 'approver step -> Approved');

  perform t.as_user('paolo.mercado@demo.prc3.example');
  perform t.fails(format('select public.wf_act(''hr_request'', %L, ''approve'')', v), 'cannot release without the generated document', '22023');
  v_path := v_emp || '/coe-generated.pdf';
  insert into storage.objects (bucket_id, name) values ('personnel-documents', v_path);
  v_res := public.create_document(v_emp, 'COE', 'Certificate of Employment', current_date, 'PRC Region III', null, null,
                                  null, null, v_path, 'coe.pdf', 'application/pdf', 2000, repeat('c', 64));
  perform public.hr_request_attach_result(v, v_res);
  perform public.wf_act('hr_request', v, 'approve', 'Released to employee');
  perform t.ok((select status from public.hr_requests where id = v) = 'completed', 'release -> Completed');
  perform t.ok((select completed_at from public.hr_requests where id = v) is not null, 'completion date recorded');

  perform t.as_user('juan.delacruz@demo.prc3.example');
  perform t.ok(t.count(format('select 1 from public.documents where id = %L', v_res)) = 1, 'employee can open the released document');
  perform t.ok((select string_agg(action, ',' order by id) from public.workflow_actions where entity_id = v) = 'submitted,assigned,approved,approved,document_attached,completed', 'full timeline recorded');
  perform public.wf_comment('hr_request', v, 'Thank you!');
end $$;

rollback;
select 'Workflow tests passed' as result;
