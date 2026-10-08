-- 0008_reporting.sql
-- Read-side functions: completion score, dashboards, data quality, search and
-- reports. Every function checks permissions itself; none relies on the UI.
set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Profile completion. The checklist below is an explicit, documented
-- assumption (docs/workflows.md) that HR can revise by replacing this function.
-- ---------------------------------------------------------------------------
create function public.profile_completion(p_employee uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  e public.employees;
  pr public.employee_private;
  v_items jsonb;
  v_total int;
  v_done int;
begin
  if not public.can_read_employee(p_employee) then
    raise exception 'Not authorized' using errcode = '42501', hint = 'user';
  end if;
  select * into e from public.employees where id = p_employee;
  select * into pr from public.employee_private where employee_id = p_employee;
  select jsonb_agg(jsonb_build_object('label', label, 'done', done)) into v_items from (values
    ('Name and sex', e.first_name is not null and e.last_name is not null and e.sex is not null),
    ('Date and place of birth', pr.birth_date is not null and pr.birth_place is not null),
    ('Civil status and citizenship', pr.civil_status is not null and pr.citizenship is not null),
    ('Contact details', pr.mobile_no is not null and pr.personal_email is not null),
    ('Residential address', exists (select 1 from public.employee_addresses where employee_id = p_employee and address_type = 'residential')),
    ('Government numbers (TIN, GSIS, PhilHealth, Pag-IBIG)',
       pr.tin is not null and pr.gsis_bp_no is not null and pr.philhealth_no is not null and pr.pagibig_no is not null),
    ('Family background', exists (select 1 from public.employee_family where employee_id = p_employee)),
    ('Educational background', exists (select 1 from public.employee_education where employee_id = p_employee)),
    ('Character references (3)', (select count(*) from public.employee_references where employee_id = p_employee) >= 3),
    ('At least one personnel document', exists (select 1 from public.documents where employee_id = p_employee and deleted_at is null)),
    ('PDS certified', exists (select 1 from public.pds_submissions where employee_id = p_employee and kind = 'certified'))
  ) t(label, done);
  select count(*), count(*) filter (where (i ->> 'done')::boolean) into v_total, v_done from jsonb_array_elements(v_items) i;
  return jsonb_build_object('percent', round(100.0 * v_done / v_total)::int, 'items', v_items);
end $$;

-- ---------------------------------------------------------------------------
-- Search. SECURITY INVOKER so RLS decides which employees the caller can see:
-- an ordinary employee only ever gets their own row.
-- ---------------------------------------------------------------------------
create function public.search_employees(
  p_query         text default null,
  p_division      uuid default null,
  p_status        text default null,
  p_record_status text default 'active',
  p_limit         int default 25,
  p_offset        int default 0
) returns table (
  id uuid, employee_no text, full_name text, position_title text, employment_status_name text,
  division_name text, unit_name text, record_status text, total_count bigint
)
language sql stable set search_path = public as $$
  with q as (
    select '%' || replace(replace(replace(coalesce(btrim(p_query), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
  )
  select d.id, d.employee_no, d.full_name, d.position_title, d.employment_status_name,
         d.division_name, d.unit_name, d.record_status, count(*) over ()
  from public.employee_directory d, q
  where (coalesce(btrim(p_query), '') = ''
         or d.full_name ilike q.pat or d.employee_no ilike q.pat or d.position_title ilike q.pat
         or d.division_name ilike q.pat or d.unit_name ilike q.pat)
    and (p_division is null or d.division_id = p_division)
    and (p_status is null or d.employment_status_code = p_status)
    and (p_record_status is null or d.record_status = p_record_status)
  order by d.full_name
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)
$$;

-- ---------------------------------------------------------------------------
-- Dashboards
-- ---------------------------------------------------------------------------
create function public.dashboard_hr() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v jsonb;
begin
  if not public.has_permission('dashboard.hr') then
    raise exception 'Not authorized' using errcode = '42501', hint = 'user';
  end if;
  select jsonb_build_object(
    'total', (select count(*) from public.employees where record_status = 'active'),
    'by_status', coalesce((select jsonb_agg(jsonb_build_object('code', s.code, 'name', s.name, 'count', c.n) order by s.sort_order)
        from public.employment_statuses s
        join (select employment_status_code, count(*) n from public.employees where record_status = 'active' group by 1) c
          on c.employment_status_code = s.code), '[]'),
    'by_division', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(division_name, 'Unassigned'), 'count', n) order by n desc)
        from (select division_name, count(*) n from public.employee_directory where record_status = 'active' group by 1) x), '[]'),
    'by_position', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(position_title, 'Unassigned'), 'count', n) order by n desc)
        from (select position_title, count(*) n from public.employee_directory where record_status = 'active'
              group by 1 order by 2 desc limit 10) x), '[]'),
    'attendance_today', jsonb_build_object(
        'recorded', (select count(*) from public.attendance_records where work_date = v_today),
        'present', (select count(*) from public.attendance_records where work_date = v_today and status_code = 'PRESENT'),
        'late', (select count(*) from public.attendance_records where work_date = v_today and status_code = 'LATE'),
        'missing_log', (select count(*) from public.attendance_records where work_date = v_today and status_code = 'MISSING_LOG'),
        'absent', (select count(*) from public.attendance_records where work_date = v_today and status_code = 'ABSENT'),
        'on_leave', (select count(*) from public.attendance_records where work_date = v_today and status_code = 'LEAVE')),
    'pending', jsonb_build_object(
        'leave', (select count(*) from public.leave_applications where status = 'in_review'),
        'attendance_corrections', (select count(*) from public.attendance_corrections where status in ('in_review', 'approved')),
        'hr_requests', (select count(*) from public.hr_requests where status in ('in_review', 'approved')),
        'documents_for_review', (select count(*) from public.documents where status = 'for_review' and deleted_at is null),
        'pds_for_review', (select count(distinct employee_id) from public.pds_submissions s
            where kind = 'certified' and not exists (
              select 1 from public.pds_submissions v where v.employee_id = s.employee_id
                and v.kind in ('verified', 'returned') and v.created_at > s.created_at)))
  ) into v;
  return v;
end $$;

-- Management view: aggregates only. No identifiers, dates of birth or contact data.
create function public.dashboard_executive() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v jsonb;
begin
  if not public.has_permission('dashboard.executive') then
    raise exception 'Not authorized' using errcode = '42501', hint = 'user';
  end if;
  select jsonb_build_object(
    'total', (select count(*) from public.employees where record_status = 'active'),
    'by_division', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(division_name, 'Unassigned'), 'count', n) order by n desc)
        from (select division_name, count(*) n from public.employee_directory where record_status = 'active' group by 1) x), '[]'),
    'by_status', coalesce((select jsonb_agg(jsonb_build_object('name', s.name, 'count', c.n) order by s.sort_order)
        from public.employment_statuses s
        join (select employment_status_code, count(*) n from public.employees where record_status = 'active' group by 1) c
          on c.employment_status_code = s.code), '[]'),
    'attendance_month', (
        select jsonb_build_object(
          'days_recorded', count(*),
          'present', count(*) filter (where s.counts_as_present),
          'absent', count(*) filter (where a.status_code = 'ABSENT'),
          'late', count(*) filter (where a.status_code = 'LATE'),
          'missing_log', count(*) filter (where a.status_code = 'MISSING_LOG'),
          'on_leave', count(*) filter (where a.status_code = 'LEAVE'))
        from public.attendance_records a join public.attendance_statuses s on s.code = a.status_code
        where a.work_date >= date_trunc('month', v_today)::date and a.work_date <= v_today),
    'pending_requests', jsonb_build_object(
        'leave', (select count(*) from public.leave_applications where status = 'in_review'),
        'attendance_corrections', (select count(*) from public.attendance_corrections where status in ('in_review', 'approved')),
        'hr_requests', (select count(*) from public.hr_requests where status in ('in_review', 'approved'))),
    'leave_utilization', coalesce((select jsonb_agg(jsonb_build_object('leave_type', lt.name, 'credited', x.credited, 'used', x.used) order by lt.sort_order)
        from (select leave_type_code, sum(beginning + earned) credited, sum(used) used from public.leave_balances
              where year = extract(year from v_today)::int group by 1) x
        join public.leave_types lt on lt.code = x.leave_type_code), '[]'),
    'milestones', coalesce((select jsonb_agg(jsonb_build_object('name', full_name, 'years', yrs, 'date', anniv) order by anniv)
        from (select d.full_name,
                     (extract(year from v_today) - extract(year from e.original_appointment_date))::int yrs,
                     make_date(extract(year from v_today)::int, extract(month from e.original_appointment_date)::int,
                               least(extract(day from e.original_appointment_date)::int, 28)) anniv
              from public.employees e join public.employee_directory d on d.id = e.id
              where e.record_status = 'active' and e.original_appointment_date is not null) m
        where yrs > 0 and yrs % 5 = 0 and anniv between v_today and v_today + 30), '[]'),
    'movements', coalesce((select jsonb_agg(jsonb_build_object('type', record_type, 'count', n))
        from (select record_type, count(*) n from public.service_records
              where date_from >= v_today - 90 and record_type <> 'appointment' group by 1) x), '[]')
  ) into v;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Data quality
-- ---------------------------------------------------------------------------
create function public.data_quality_report()
returns table (check_code text, severity text, employee_id uuid, employee_no text, full_name text, detail text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_permission('dq.read') then
    raise exception 'Not authorized' using errcode = '42501', hint = 'user';
  end if;
  return query
  with emp as (
    select e.*, d.full_name as fname from public.employees e join public.employee_directory d on d.id = e.id
    where e.record_status = 'active'
  ), issues as (
    select 'MISSING_POSITION', 'error', id, 'No position assigned' from emp where position_id is null
    union all select 'MISSING_ORG_UNIT', 'error', id, 'No office/unit assigned' from emp where org_unit_id is null
    union all select 'MISSING_EMPLOYMENT_STATUS', 'error', id, 'No employment status' from emp where employment_status_code is null
    union all select 'MISSING_APPOINTMENT_DATE', 'warning', id, 'No current appointment date' from emp where current_appointment_date is null
    union all select 'MISSING_PERSONAL_INFO', 'warning', e.id, 'Date of birth is not recorded'
      from emp e left join public.employee_private p on p.employee_id = e.id where p.birth_date is null
    union all select 'MISSING_GOVERNMENT_ID', 'info', e.id,
        'Missing: ' || concat_ws(', ', case when p.tin is null then 'TIN' end, case when p.gsis_bp_no is null then 'GSIS' end,
                                 case when p.philhealth_no is null then 'PhilHealth' end, case when p.pagibig_no is null then 'Pag-IBIG' end)
      from emp e left join public.employee_private p on p.employee_id = e.id
      where p.tin is null or p.gsis_bp_no is null or p.philhealth_no is null or p.pagibig_no is null
    union all select 'DUPLICATE_PERSON', 'error', e.id, 'Same name and date of birth as another record'
      from emp e join public.employee_private p on p.employee_id = e.id
      where exists (select 1 from public.employees o join public.employee_private op on op.employee_id = o.id
                    where o.id <> e.id and lower(o.last_name) = lower(e.last_name) and lower(o.first_name) = lower(e.first_name)
                      and op.birth_date = p.birth_date)
    union all select 'DATE_CONFLICT', 'error', id, 'Date assumed is earlier than the current appointment date'
      from emp where date_assumed < current_appointment_date
    union all select 'DATE_CONFLICT', 'error', e.id, 'Original appointment is earlier than age 18'
      from emp e join public.employee_private p on p.employee_id = e.id
      where e.original_appointment_date < (p.birth_date + interval '18 years')::date
    union all select 'STATUS_CONFLICT', 'error', id, 'Marked active but separation date has passed'
      from emp where separation_date is not null and separation_date <= current_date
    union all select 'NO_SERVICE_RECORD', 'warning', id, 'No service record entries'
      from emp where not exists (select 1 from public.service_records s where s.employee_id = emp.id)
    union all select 'SERVICE_RECORD_MISMATCH', 'warning', e.id, 'Current service record differs from employment information'
      from emp e join public.positions pos on pos.id = e.position_id
      join public.current_service_record c on c.employee_id = e.id
      where c.date_to is null and (c.position_title <> pos.title
            or c.salary_grade is distinct from e.salary_grade or c.salary_step is distinct from e.salary_step)
    union all select 'ORG_INCONSISTENT', 'warning', e.id, 'Assigned unit is outside the plantilla item''s unit'
      from emp e join public.plantilla_items pi on pi.id = e.plantilla_item_id
      where e.org_unit_id is not null and not exists (
        select 1 from public.org_unit_ancestry a where a.unit_id = e.org_unit_id and a.ancestor_id = pi.org_unit_id)
    union all select 'ORG_INCONSISTENT', 'warning', e.id, 'Position differs from the plantilla item''s position'
      from emp e join public.plantilla_items pi on pi.id = e.plantilla_item_id
      where e.position_id is distinct from pi.position_id
    union all select 'SUPERVISOR_INACTIVE', 'warning', e.id, 'Supervisor record is not active'
      from emp e join public.employees s on s.id = e.supervisor_employee_id where s.record_status <> 'active'
    union all select 'MISSING_REQUIRED_DOCUMENT', 'warning', e.id, 'Missing: ' || c.name
      from emp e cross join public.document_categories c
      where c.is_required and c.is_active and not exists (
        select 1 from public.documents d where d.employee_id = e.id and d.category_code = c.code
          and d.deleted_at is null and d.status <> 'rejected')
    union all select 'EXPIRED_DOCUMENT', 'warning', d.employee_id, 'Expired: ' || d.title || ' (' || d.expires_on || ')'
      from public.documents d join emp e on e.id = d.employee_id
      where d.deleted_at is null and d.expires_on < current_date
    union all select 'DUPLICATE_DOCUMENT', 'info', x.employee_id, 'Identical file stored under ' || x.n || ' documents'
      from (select d.employee_id, v.sha256, count(distinct d.id) n
            from public.document_versions v join public.documents d on d.id = v.document_id
            where d.deleted_at is null group by 1, 2 having count(distinct d.id) > 1) x
      join emp e on e.id = x.employee_id
  )
  select i.c, i.s, i.eid, e.employee_no, e.fname, i.d
  from issues i(c, s, eid, d)
  join emp e on e.id = i.eid
  order by case i.s when 'error' then 1 when 'warning' then 2 else 3 end, i.c, e.fname;
end $$;

-- ---------------------------------------------------------------------------
-- Reports (aggregate/management data; gated by report.view)
-- ---------------------------------------------------------------------------
create function public.assert_report_access() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_permission('report.view') then
    raise exception 'Not authorized' using errcode = '42501', hint = 'user';
  end if;
end $$;

create function public.report_attendance_summary(p_from date, p_to date, p_division uuid default null)
returns table (employee_no text, full_name text, division_name text, present int, late int, undertime int,
               absent int, missing_log int, on_leave int, other int, total_hours numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_report_access();
  return query
  select d.employee_no, d.full_name, d.division_name,
         (count(*) filter (where a.status_code = 'PRESENT'))::int,
         (count(*) filter (where a.status_code = 'LATE'))::int,
         (count(*) filter (where a.status_code = 'UNDERTIME'))::int,
         (count(*) filter (where a.status_code = 'ABSENT'))::int,
         (count(*) filter (where a.status_code = 'MISSING_LOG'))::int,
         (count(*) filter (where a.status_code = 'LEAVE'))::int,
         (count(*) filter (where a.status_code not in ('PRESENT', 'LATE', 'UNDERTIME', 'ABSENT', 'MISSING_LOG', 'LEAVE')))::int,
         round(coalesce(sum(a.total_minutes), 0) / 60.0, 2)
  from public.employee_directory d
  left join public.attendance_records a on a.employee_id = d.id and a.work_date between p_from and p_to
  where d.record_status = 'active' and (p_division is null or d.division_id = p_division)
  group by d.id, d.employee_no, d.full_name, d.division_name
  order by d.full_name;
end $$;

create function public.report_leave_summary(p_year int, p_division uuid default null)
returns table (employee_no text, full_name text, division_name text, leave_type text,
               beginning numeric, earned numeric, used numeric, pending numeric, available numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_report_access();
  return query
  select d.employee_no, d.full_name, d.division_name, s.leave_type_name, s.beginning, s.earned, s.used, s.pending, s.available
  from public.leave_balance_summary s
  join public.employee_directory d on d.id = s.employee_id
  where s.year = p_year and (p_division is null or d.division_id = p_division)
  order by d.full_name, s.leave_type_name;
end $$;

create function public.report_personnel_movement(p_from date, p_to date)
returns table (employee_no text, full_name text, division_name text, record_type text, position_title text,
               appointment_status text, effective_date date, remarks text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_report_access();
  return query
  select d.employee_no, d.full_name, d.division_name, s.record_type, s.position_title, s.appointment_status, s.date_from, s.remarks
  from public.service_records s join public.employee_directory d on d.id = s.employee_id
  where s.date_from between p_from and p_to
  order by s.date_from desc, d.full_name;
end $$;

create function public.report_plantilla_summary()
returns table (item_number text, position_title text, salary_grade smallint, unit_name text, incumbent text, employment_status text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_report_access();
  return query
  select pi.item_number, p.title, pi.salary_grade, u.name, coalesce(d.full_name, 'VACANT'), d.employment_status_name
  from public.plantilla_items pi
  join public.positions p on p.id = pi.position_id
  join public.org_units u on u.id = pi.org_unit_id
  left join public.employees e on e.plantilla_item_id = pi.id and e.record_status = 'active'
  left join public.employee_directory d on d.id = e.id
  where pi.is_active
  order by pi.item_number;
end $$;

create function public.report_hr_requests(p_from date, p_to date)
returns table (request_no text, request_type text, requester text, priority text, status text,
               submitted_at timestamptz, completed_at timestamptz, days_open numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_report_access();
  return query
  select h.request_no, t.name, d.full_name, h.priority, h.status, h.submitted_at, h.completed_at,
         round(extract(epoch from (coalesce(h.completed_at, now()) - h.submitted_at)) / 86400.0, 1)
  from public.hr_requests h
  join public.hr_request_types t on t.code = h.request_type_code
  join public.employee_directory d on d.id = h.employee_id
  where h.submitted_at::date between p_from and p_to
  order by h.submitted_at desc;
end $$;

create function public.report_document_compliance()
returns table (employee_no text, full_name text, division_name text, category text, compliance text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_report_access();
  return query
  select d.employee_no, d.full_name, d.division_name, c.name,
         case
           when doc.id is null then 'Missing'
           when doc.expires_on < current_date then 'Expired'
           when doc.status = 'for_review' then 'For review'
           else 'Complete'
         end
  from public.employee_directory d
  cross join public.document_categories c
  left join lateral (
    select x.* from public.documents x
    where x.employee_id = d.id and x.category_code = c.code and x.deleted_at is null and x.status <> 'rejected'
    order by x.created_at desc limit 1) doc on true
  where d.record_status = 'active' and c.is_required and c.is_active
  order by d.full_name, c.name;
end $$;

create function public.report_training_summary(p_from date, p_to date)
returns table (employee_no text, full_name text, division_name text, trainings int, total_hours numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_report_access();
  if not public.has_permission('pds.read_all') then
    raise exception 'Not authorized' using errcode = '42501', hint = 'user';
  end if;
  return query
  select d.employee_no, d.full_name, d.division_name, (count(t.id))::int, coalesce(sum(t.hours), 0)
  from public.employee_directory d
  left join public.employee_training t on t.employee_id = d.id and t.date_from between p_from and p_to
  where d.record_status = 'active'
  group by d.id, d.employee_no, d.full_name, d.division_name
  order by d.full_name;
end $$;
