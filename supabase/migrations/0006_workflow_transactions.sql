-- 0006_workflow_transactions.sql
-- TRANSACTION DATA: leave, attendance and HR requests, driven by one
-- configurable workflow engine. Approval routes are rows in `workflows` /
-- `workflow_steps`, not code. All state transitions happen inside the
-- SECURITY DEFINER functions below; clients cannot write status columns.
set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Workflow definitions (configuration)
-- ---------------------------------------------------------------------------
create table public.workflows (
  code        text primary key,
  name        text not null,
  entity_type text not null check (entity_type in ('leave_application', 'attendance_correction', 'hr_request')),
  description text,
  is_default  boolean not null default false,
  is_active   boolean not null default true
);
create unique index workflows_default_uq on public.workflows(entity_type) where is_default;

create table public.workflow_steps (
  id                  uuid primary key default gen_random_uuid(),
  workflow_code       text not null references public.workflows(code) on delete cascade,
  step_order          int  not null check (step_order > 0),
  name                text not null,  -- shown as the request status while the step is pending
  actor_kind          text not null check (actor_kind in ('supervisor', 'permission')),
  required_permission text references public.permissions(code),
  -- status the request takes once this step is approved
  status_on_approve   text not null default 'in_review' check (status_on_approve in ('in_review', 'approved', 'completed')),
  unique (workflow_code, step_order),
  check (actor_kind = 'supervisor' or required_permission is not null)
);

-- Append-only timeline of everything that happens to a request.
create table public.workflow_actions (
  id          bigint generated always as identity primary key,
  entity_type text not null,
  entity_id   uuid not null,
  step_order  int,
  step_name   text,
  action      text not null check (action in
              ('submitted', 'approved', 'rejected', 'returned', 'cancelled', 'completed', 'comment', 'assigned', 'document_attached')),
  actor_user_id uuid,
  actor_name  text not null,
  remarks     text,
  from_status text,
  to_status   text,
  created_at  timestamptz not null default now()
);
create index workflow_actions_entity_idx on public.workflow_actions(entity_type, entity_id, created_at);

create function public.workflow_actions_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'Request history is immutable' using errcode = '42501', hint = 'user';
end $$;
create trigger workflow_actions_no_change before update or delete on public.workflow_actions
  for each row execute function public.workflow_actions_immutable();

-- ---------------------------------------------------------------------------
-- Leave
-- ---------------------------------------------------------------------------
create table public.leave_types (
  code             text primary key,
  name             text not null,
  requires_balance boolean not null default false,  -- block filing beyond available balance
  deducts_balance  boolean not null default true,
  -- Optional, administrator-defined earning rule (documentation / future accrual job).
  -- The system never infers legal entitlement on its own.
  accrual_rule     jsonb,
  workflow_code    text references public.workflows(code),
  sort_order       int not null default 0,
  is_active        boolean not null default true
);

create table public.leave_balances (
  employee_id     uuid not null references public.employees(id) on delete cascade,
  leave_type_code text not null references public.leave_types(code),
  year            int  not null check (year between 2000 and 2100),
  beginning       numeric(7, 3) not null default 0 check (beginning >= 0),
  earned          numeric(7, 3) not null default 0 check (earned >= 0),
  used            numeric(7, 3) not null default 0 check (used >= 0),
  updated_at      timestamptz not null default now(),
  primary key (employee_id, leave_type_code, year)
);
create trigger leave_balances_updated_at before update on public.leave_balances
  for each row execute function public.set_updated_at();

create table public.leave_applications (
  id                 uuid primary key default gen_random_uuid(),
  request_no         text not null unique,
  employee_id        uuid not null references public.employees(id) on delete cascade,
  leave_type_code    text not null references public.leave_types(code),
  date_from          date not null,
  date_to            date not null,
  days               numeric(5, 2),
  reason             text,
  status             text not null default 'draft'
                       check (status in ('draft', 'in_review', 'approved', 'rejected', 'cancelled', 'completed')),
  workflow_code      text references public.workflows(code),
  current_step_order int,
  submitted_at       timestamptz,
  completed_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (date_to >= date_from),
  check (days is null or days > 0)
);
create index leave_applications_employee_idx on public.leave_applications(employee_id, date_from desc);
create index leave_applications_open_idx on public.leave_applications(status) where status in ('in_review', 'approved');
create trigger leave_applications_updated_at before update on public.leave_applications
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Attendance
-- ---------------------------------------------------------------------------
create table public.attendance_statuses (
  code               text primary key,
  name               text not null,
  counts_as_present  boolean not null default false,
  sort_order         int not null default 0,
  is_active          boolean not null default true
);

create table public.attendance_records (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete cascade,
  work_date     date not null,
  time_in       timestamptz,
  time_out      timestamptz,
  break_minutes int not null default 0 check (break_minutes >= 0),
  total_minutes int generated always as (
    case when time_in is not null and time_out is not null
      then greatest(0, (extract(epoch from (time_out - time_in)) / 60)::int - break_minutes)
    end) stored,
  status_code   text not null references public.attendance_statuses(code),
  remarks       text,
  source        text not null default 'manual' check (source in ('manual', 'biometric', 'import', 'correction')),
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (employee_id, work_date),
  check (time_out is null or time_in is null or time_out > time_in)
);
create index attendance_records_date_idx on public.attendance_records(work_date);
create trigger attendance_records_updated_at before update on public.attendance_records
  for each row execute function public.set_updated_at();

create table public.attendance_corrections (
  id                 uuid primary key default gen_random_uuid(),
  request_no         text not null unique,
  employee_id        uuid not null references public.employees(id) on delete cascade,
  work_date          date not null,
  correction_type    text not null check (correction_type in
                       ('missing_time_in', 'missing_time_out', 'incorrect_time', 'absent_but_present', 'other')),
  proposed_time_in   timestamptz,
  proposed_time_out  timestamptz,
  reason             text,
  remarks            text,
  status             text not null default 'draft'
                       check (status in ('draft', 'in_review', 'approved', 'rejected', 'cancelled', 'completed')),
  workflow_code      text references public.workflows(code),
  current_step_order int,
  submitted_at       timestamptz,
  completed_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (proposed_time_out is null or proposed_time_in is null or proposed_time_out > proposed_time_in)
);
create index attendance_corrections_employee_idx on public.attendance_corrections(employee_id, work_date desc);
-- One open correction per employee/date/type.
create unique index attendance_corrections_open_uq
  on public.attendance_corrections(employee_id, work_date, correction_type)
  where status in ('draft', 'in_review', 'approved');
create trigger attendance_corrections_updated_at before update on public.attendance_corrections
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- HR service requests
-- ---------------------------------------------------------------------------
create table public.hr_request_types (
  code                text primary key,
  name                text not null,
  description         text,
  workflow_code       text references public.workflows(code),
  requires_attachment boolean not null default false,
  produces_document   boolean not null default false,
  sort_order          int not null default 0,
  is_active           boolean not null default true
);

create table public.hr_requests (
  id                 uuid primary key default gen_random_uuid(),
  request_no         text not null unique,
  employee_id        uuid not null references public.employees(id) on delete cascade,
  request_type_code  text not null references public.hr_request_types(code),
  priority           text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  subject            text not null check (length(btrim(subject)) > 0),
  details            text,
  assigned_to        uuid references public.profiles(user_id),
  result_document_id uuid references public.documents(id),
  status             text not null default 'draft'
                       check (status in ('draft', 'in_review', 'approved', 'rejected', 'cancelled', 'completed')),
  workflow_code      text references public.workflows(code),
  current_step_order int,
  submitted_at       timestamptz,
  completed_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index hr_requests_employee_idx on public.hr_requests(employee_id, created_at desc);
create index hr_requests_open_idx on public.hr_requests(status) where status in ('in_review', 'approved');
create trigger hr_requests_updated_at before update on public.hr_requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Engine internals
-- ---------------------------------------------------------------------------
create function public.wf_table(p_entity_type text) returns text
language sql immutable as $$
  select case p_entity_type
    when 'leave_application' then 'leave_applications'
    when 'attendance_correction' then 'attendance_corrections'
    when 'hr_request' then 'hr_requests'
  end
$$;

create function public.wf_read_all_permission(p_entity_type text) returns text
language sql immutable as $$
  select case p_entity_type
    when 'leave_application' then 'leave.read_all'
    when 'attendance_correction' then 'attendance.read_all'
    when 'hr_request' then 'request.read_all'
  end
$$;

create function public.wf_link(p_entity_type text, p_id uuid) returns text
language sql immutable as $$
  select case p_entity_type
    when 'leave_application' then '/leave/' || p_id
    when 'attendance_correction' then '/attendance/corrections/' || p_id
    when 'hr_request' then '/requests/' || p_id
  end
$$;

create function public.wf_employee_of(p_entity_type text, p_id uuid) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v_emp uuid;
begin
  if public.wf_table(p_entity_type) is null then
    return null;
  end if;
  execute format('select employee_id from public.%I where id = $1', public.wf_table(p_entity_type))
    into v_emp using p_id;
  return v_emp;
end $$;

-- May the caller read (and attach supporting files to) this request?
create function public.can_read_request(p_entity_type text, p_id uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_emp uuid := public.wf_employee_of(p_entity_type, p_id);
begin
  if v_emp is null then
    return false;
  end if;
  return public.is_self(v_emp)
      or public.supervises(v_emp)
      or public.has_permission(public.wf_read_all_permission(p_entity_type));
end $$;

-- Can the caller act on this step for a request filed by p_employee?
create function public.wf_can_act(p_step public.workflow_steps, p_employee uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not public.is_self(p_employee) and (
    case p_step.actor_kind
      when 'supervisor' then
        public.supervises(p_employee)
        -- No supervisor on record: HR may stand in so requests never stall.
        or (public.has_permission('workflow.override')
            and not exists (select 1 from public.supervisor_user_ids(p_employee)))
      else public.has_permission(p_step.required_permission)
    end)
$$;

create function public.wf_log(
  p_type text, p_id uuid, p_step_order int, p_step_name text, p_action text,
  p_remarks text, p_from text, p_to text
) returns void
language sql security definer set search_path = public as $$
  insert into public.workflow_actions
    (entity_type, entity_id, step_order, step_name, action, actor_user_id, actor_name, remarks, from_status, to_status)
  values (p_type, p_id, p_step_order, p_step_name, p_action, auth.uid(), public.audit_actor_label(),
          nullif(btrim(p_remarks), ''), p_from, p_to)
$$;

-- Tell whoever must act on the step that it is waiting for them.
create function public.wf_notify_step(p_type text, p_id uuid, p_request_no text, p_employee uuid, p_step public.workflow_steps)
returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_requester uuid;
begin
  select user_id into v_requester from public.profiles where employee_id = p_employee;
  if p_step.actor_kind = 'supervisor' then
    for v_user in select public.supervisor_user_ids(p_employee) loop
      perform public.notify(v_user, 'action_required', 'Action required: ' || p_request_no,
        p_step.name || ' — a request from your team is waiting for your decision.',
        public.wf_link(p_type, p_id), p_type, p_id);
    end loop;
    if not exists (select 1 from public.supervisor_user_ids(p_employee)) then
      for v_user in select public.users_with_permission('workflow.override') loop
        perform public.notify(v_user, 'action_required', 'No supervisor on record: ' || p_request_no,
          'This request has no assigned supervisor and needs HR attention.',
          public.wf_link(p_type, p_id), p_type, p_id);
      end loop;
    end if;
  else
    for v_user in select public.users_with_permission(p_step.required_permission) loop
      if v_user is distinct from v_requester then
        perform public.notify(v_user, 'action_required', 'Action required: ' || p_request_no,
          p_step.name || ' — a request is waiting for HR action.',
          public.wf_link(p_type, p_id), p_type, p_id);
      end if;
    end loop;
  end if;
end $$;

-- Per-type checks before a draft may be submitted.
create function public.wf_validate_submit(p_type text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  l public.leave_applications;
  lt public.leave_types;
  c public.attendance_corrections;
  h public.hr_requests;
  ht public.hr_request_types;
  v_available numeric;
begin
  if p_type = 'leave_application' then
    select * into l from public.leave_applications where id = p_id;
    select * into lt from public.leave_types where code = l.leave_type_code and is_active;
    if lt.code is null then
      raise exception 'This leave type is not available' using errcode = '22023', hint = 'user';
    end if;
    if exists (
      select 1 from public.leave_applications o
      where o.employee_id = l.employee_id and o.id <> l.id and o.status in ('in_review', 'approved')
        and daterange(o.date_from, o.date_to, '[]') && daterange(l.date_from, l.date_to, '[]')
    ) then
      raise exception 'You already have a leave application covering these dates' using errcode = '23P01', hint = 'user';
    end if;
    if lt.requires_balance then
      select coalesce(b.beginning + b.earned - b.used, 0)
             - coalesce((select sum(o.days) from public.leave_applications o
                         where o.employee_id = l.employee_id and o.leave_type_code = l.leave_type_code
                           and o.id <> l.id and o.status = 'in_review'
                           and extract(year from o.date_from) = extract(year from l.date_from)), 0)
        into v_available
      from (select 1) x
      left join public.leave_balances b
        on b.employee_id = l.employee_id and b.leave_type_code = l.leave_type_code
       and b.year = extract(year from l.date_from)::int;
      if l.days > v_available then
        raise exception 'Insufficient leave balance for this application' using errcode = '22023', hint = 'user';
      end if;
    end if;
  elsif p_type = 'attendance_correction' then
    select * into c from public.attendance_corrections where id = p_id;
    if coalesce(btrim(c.reason), '') = '' then
      raise exception 'A reason is required' using errcode = '22023', hint = 'user';
    end if;
    if c.work_date > (now() at time zone 'Asia/Manila')::date then
      raise exception 'The date cannot be in the future' using errcode = '22023', hint = 'user';
    end if;
    if c.correction_type = 'missing_time_in' and c.proposed_time_in is null
       or c.correction_type = 'missing_time_out' and c.proposed_time_out is null
       or c.correction_type = 'incorrect_time' and c.proposed_time_in is null and c.proposed_time_out is null then
      raise exception 'Provide the corrected time' using errcode = '22023', hint = 'user';
    end if;
  elsif p_type = 'hr_request' then
    select * into h from public.hr_requests where id = p_id;
    select * into ht from public.hr_request_types where code = h.request_type_code and is_active;
    if ht.code is null then
      raise exception 'This request type is not available' using errcode = '22023', hint = 'user';
    end if;
    if ht.requires_attachment and not exists (
      select 1 from public.documents d
      where d.related_entity_type = 'hr_request' and d.related_entity_id = p_id and d.deleted_at is null
    ) then
      raise exception 'A supporting document is required for this request type' using errcode = '22023', hint = 'user';
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Public engine API
-- ---------------------------------------------------------------------------
create function public.wf_submit(p_type text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_first public.workflow_steps;
begin
  if public.wf_table(p_type) is null then
    raise exception 'Unknown request type' using errcode = '22023', hint = 'user';
  end if;
  execute format('select id, employee_id, status, workflow_code, request_no from public.%I where id = $1 for update',
                 public.wf_table(p_type)) into r using p_id;
  if r.id is null or not public.is_self(r.employee_id) then
    raise exception 'Not authorized' using errcode = '42501', hint = 'user';
  end if;
  if r.status <> 'draft' then
    raise exception 'Only a draft can be submitted' using errcode = '22023', hint = 'user';
  end if;
  perform public.wf_validate_submit(p_type, p_id);

  select * into v_first from public.workflow_steps where workflow_code = r.workflow_code order by step_order limit 1;
  if v_first.id is null then
    raise exception 'No workflow is configured for this request' using errcode = 'P0001', hint = 'user';
  end if;

  execute format('update public.%I set status = ''in_review'', current_step_order = $2, submitted_at = now() where id = $1',
                 public.wf_table(p_type)) using p_id, v_first.step_order;
  perform public.wf_log(p_type, p_id, v_first.step_order, v_first.name, 'submitted', null, 'draft', 'in_review');
  perform public.wf_notify_step(p_type, p_id, r.request_no, r.employee_id, v_first);
end $$;

-- p_action: approve | reject | return | cancel
create function public.wf_act(p_type text, p_id uuid, p_action text, p_remarks text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_step public.workflow_steps;
  v_next public.workflow_steps;
  v_to text;
  v_next_order int;
  v_completed boolean := false;
  v_final boolean;
  ht public.hr_request_types;
  v_requester uuid;
begin
  if public.wf_table(p_type) is null then
    raise exception 'Unknown request type' using errcode = '22023', hint = 'user';
  end if;
  if p_action not in ('approve', 'reject', 'return', 'cancel') then
    raise exception 'Unknown action' using errcode = '22023', hint = 'user';
  end if;
  execute format('select id, employee_id, status, workflow_code, current_step_order, request_no, %s as type_code from public.%I where id = $1 for update',
                 case p_type when 'hr_request' then 'request_type_code' else 'null::text' end,
                 public.wf_table(p_type)) into r using p_id;
  if r.id is null then
    raise exception 'Request not found' using errcode = 'P0002', hint = 'user';
  end if;
  select user_id into v_requester from public.profiles where employee_id = r.employee_id;

  if p_action = 'cancel' then
    -- Only open requests: a request whose last step is approved is final, and
    -- cancelling it would leave balances and records inconsistent.
    if r.status not in ('draft', 'in_review', 'approved')
       or (r.status = 'approved' and r.current_step_order is null) then
      raise exception 'This request can no longer be cancelled' using errcode = '22023', hint = 'user';
    end if;
    if not (public.is_self(r.employee_id) or public.has_permission('workflow.override')) then
      raise exception 'Not authorized' using errcode = '42501', hint = 'user';
    end if;
    select * into v_step from public.workflow_steps where workflow_code = r.workflow_code and step_order = r.current_step_order;
    execute format('update public.%I set status = ''cancelled'', current_step_order = null, completed_at = now() where id = $1',
                   public.wf_table(p_type)) using p_id;
    perform public.wf_log(p_type, p_id, r.current_step_order, v_step.name, 'cancelled', p_remarks, r.status, 'cancelled');
    if v_requester is not null and v_requester is distinct from auth.uid() then
      perform public.notify(v_requester, 'request_update', r.request_no || ' was cancelled', coalesce(p_remarks, ''),
                            public.wf_link(p_type, p_id), p_type, p_id);
    end if;
    return;
  end if;

  if r.status not in ('in_review', 'approved') or r.current_step_order is null then
    raise exception 'This request is not awaiting action' using errcode = '22023', hint = 'user';
  end if;
  select * into v_step from public.workflow_steps where workflow_code = r.workflow_code and step_order = r.current_step_order;
  if not public.wf_can_act(v_step, r.employee_id) then
    raise exception 'Not authorized to act on this step' using errcode = '42501', hint = 'user';
  end if;
  if p_action in ('reject', 'return') and coalesce(btrim(p_remarks), '') = '' then
    raise exception 'Remarks are required' using errcode = '22023', hint = 'user';
  end if;

  if p_action = 'reject' then
    execute format('update public.%I set status = ''rejected'', current_step_order = null, completed_at = now() where id = $1',
                   public.wf_table(p_type)) using p_id;
    perform public.wf_log(p_type, p_id, v_step.step_order, v_step.name, 'rejected', p_remarks, r.status, 'rejected');
    if v_requester is not null then
      perform public.notify(v_requester, 'request_update', r.request_no || ' was not approved', p_remarks,
                            public.wf_link(p_type, p_id), p_type, p_id);
    end if;
    return;
  end if;

  if p_action = 'return' then
    execute format('update public.%I set status = ''draft'', current_step_order = null where id = $1',
                   public.wf_table(p_type)) using p_id;
    perform public.wf_log(p_type, p_id, v_step.step_order, v_step.name, 'returned', p_remarks, r.status, 'draft');
    if v_requester is not null then
      perform public.notify(v_requester, 'request_update', r.request_no || ' was returned for revision', p_remarks,
                            public.wf_link(p_type, p_id), p_type, p_id);
    end if;
    return;
  end if;

  -- approve
  select * into v_next from public.workflow_steps
  where workflow_code = r.workflow_code and step_order > v_step.step_order
  order by step_order limit 1;
  v_final := v_next.id is null;

  if p_type = 'hr_request' and v_final then
    select * into ht from public.hr_request_types where code = r.type_code;
    if ht.produces_document and not exists (
      select 1 from public.hr_requests where id = p_id and result_document_id is not null) then
      raise exception 'Attach the generated document before releasing this request' using errcode = '22023', hint = 'user';
    end if;
  end if;

  if v_final then
    v_to := case when v_step.status_on_approve = 'in_review' then 'completed' else v_step.status_on_approve end;
    v_next_order := null;
    v_completed := true;
  else
    v_to := v_step.status_on_approve;
    v_next_order := v_next.step_order;
  end if;

  execute format('update public.%I set status = $2, current_step_order = $3, completed_at = case when $4 then now() end where id = $1',
                 public.wf_table(p_type)) using p_id, v_to, v_next_order, v_completed;
  perform public.wf_log(p_type, p_id, v_step.step_order, v_step.name, case when v_final then 'completed' else 'approved' end,
                        p_remarks, r.status, v_to);

  if v_requester is not null then
    perform public.notify(v_requester, 'request_update',
      r.request_no || case when v_final then ' is complete' else ' was approved at: ' || v_step.name end,
      coalesce(p_remarks, ''), public.wf_link(p_type, p_id), p_type, p_id);
  end if;
  if not v_final then
    perform public.wf_notify_step(p_type, p_id, r.request_no, r.employee_id, v_next);
  end if;
end $$;

create function public.wf_comment(p_type text, p_id uuid, p_remarks text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid;
  v_no text;
  v_requester uuid;
begin
  if coalesce(btrim(p_remarks), '') = '' then
    raise exception 'Comment is empty' using errcode = '22023', hint = 'user';
  end if;
  if not public.can_read_request(p_type, p_id) then
    raise exception 'Not authorized' using errcode = '42501', hint = 'user';
  end if;
  v_emp := public.wf_employee_of(p_type, p_id);
  execute format('select request_no from public.%I where id = $1', public.wf_table(p_type)) into v_no using p_id;
  perform public.wf_log(p_type, p_id, null, null, 'comment', p_remarks, null, null);
  select user_id into v_requester from public.profiles where employee_id = v_emp;
  if v_requester is not null and v_requester is distinct from auth.uid() then
    perform public.notify(v_requester, 'request_update', 'New comment on ' || v_no, p_remarks,
                          public.wf_link(p_type, p_id), p_type, p_id);
  end if;
end $$;

create function public.hr_request_assign(p_request uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare h public.hr_requests;
begin
  if not public.has_permission('request.process') then
    raise exception 'Not authorized' using errcode = '42501', hint = 'user';
  end if;
  select * into h from public.hr_requests where id = p_request and status in ('in_review', 'approved') for update;
  if not found then
    raise exception 'Request is not open' using errcode = '22023', hint = 'user';
  end if;
  if not exists (select 1 from public.users_with_permission('request.process') u where u = p_user) then
    raise exception 'The assignee cannot process requests' using errcode = '22023', hint = 'user';
  end if;
  update public.hr_requests set assigned_to = p_user where id = p_request;
  perform public.wf_log('hr_request', p_request, h.current_step_order, null, 'assigned',
                        (select display_name from public.profiles where user_id = p_user), h.status, h.status);
  perform public.notify(p_user, 'action_required', 'Assigned to you: ' || h.request_no, h.subject,
                        public.wf_link('hr_request', p_request), 'hr_request', p_request);
end $$;

-- HR links the generated certificate/document to the request (visible to the requester).
create function public.hr_request_attach_result(p_request uuid, p_document uuid) returns void
language plpgsql security definer set search_path = public as $$
declare h public.hr_requests; d public.documents;
begin
  if not public.has_permission('request.process') then
    raise exception 'Not authorized' using errcode = '42501', hint = 'user';
  end if;
  select * into h from public.hr_requests where id = p_request and status in ('in_review', 'approved') for update;
  select * into d from public.documents where id = p_document and deleted_at is null;
  if h.id is null or d.id is null or d.employee_id <> h.employee_id then
    raise exception 'Document does not belong to this requester' using errcode = '22023', hint = 'user';
  end if;
  update public.hr_requests set result_document_id = p_document where id = p_request;
  perform public.wf_log('hr_request', p_request, h.current_step_order, null, 'document_attached', d.title, h.status, h.status);
end $$;

-- Items waiting for the caller's decision (supervisor / HR inbox). SECURITY
-- INVOKER: RLS limits it to requests the caller may already see.
create function public.my_pending_actions()
returns table (
  entity_type text, entity_id uuid, request_no text, employee_id uuid, employee_name text,
  summary text, step_name text, submitted_at timestamptz
)
language sql stable set search_path = public as $$
  select * from (
    select 'leave_application'::text, l.id, l.request_no, l.employee_id, d.full_name,
           lt.name || ' · ' || l.days || ' day(s)', s.name, l.submitted_at
    from public.leave_applications l
    join public.workflow_steps s on s.workflow_code = l.workflow_code and s.step_order = l.current_step_order
    join public.leave_types lt on lt.code = l.leave_type_code
    join public.employee_directory d on d.id = l.employee_id
    where l.status in ('in_review', 'approved') and public.wf_can_act(s, l.employee_id)
    union all
    select 'attendance_correction', c.id, c.request_no, c.employee_id, d.full_name,
           replace(c.correction_type, '_', ' ') || ' · ' || c.work_date, s.name, c.submitted_at
    from public.attendance_corrections c
    join public.workflow_steps s on s.workflow_code = c.workflow_code and s.step_order = c.current_step_order
    join public.employee_directory d on d.id = c.employee_id
    where c.status in ('in_review', 'approved') and public.wf_can_act(s, c.employee_id)
    union all
    select 'hr_request', h.id, h.request_no, h.employee_id, d.full_name, h.subject, s.name, h.submitted_at
    from public.hr_requests h
    join public.workflow_steps s on s.workflow_code = h.workflow_code and s.step_order = h.current_step_order
    join public.employee_directory d on d.id = h.employee_id
    where h.status in ('in_review', 'approved') and public.wf_can_act(s, h.employee_id)
  ) t(entity_type, entity_id, request_no, employee_id, employee_name, summary, step_name, submitted_at)
  order by submitted_at
$$;

-- ---------------------------------------------------------------------------
-- Row-level triggers
-- ---------------------------------------------------------------------------

-- Assign request number and workflow when a draft is created; the client
-- cannot choose either, nor start in any state other than draft.
create function public.prepare_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_type text; v_code text;
begin
  if tg_table_name = 'leave_applications' then
    v_type := 'leave_application';
    new.request_no := public.next_number('LV');
    select workflow_code into v_code from public.leave_types where code = new.leave_type_code;
  elsif tg_table_name = 'attendance_corrections' then
    v_type := 'attendance_correction';
    new.request_no := public.next_number('AC');
  else
    v_type := 'hr_request';
    new.request_no := public.next_number('HR');
    select workflow_code into v_code from public.hr_request_types where code = new.request_type_code;
  end if;
  if v_code is null then
    select code into v_code from public.workflows where entity_type = v_type and is_default and is_active;
  end if;
  if v_code is null then
    raise exception 'No workflow is configured for this request' using errcode = 'P0001', hint = 'user';
  end if;
  new.workflow_code := v_code;
  new.status := 'draft';
  new.current_step_order := null;
  new.submitted_at := null;
  new.completed_at := null;
  return new;
end $$;
create trigger leave_set_workflow before insert on public.leave_applications
  for each row execute function public.prepare_request();
create trigger attendance_corrections_set_workflow before insert on public.attendance_corrections
  for each row execute function public.prepare_request();
create trigger hr_requests_set_workflow before insert on public.hr_requests
  for each row execute function public.prepare_request();

-- Clients may not touch engine-managed columns; only the engine functions may.
create function public.guard_workflow_columns() returns trigger
language plpgsql as $$
declare
  k text;
  c_protected text[] := array['status', 'workflow_code', 'current_step_order', 'submitted_at', 'completed_at',
                              'request_no', 'employee_id', 'assigned_to', 'result_document_id'];
begin
  if current_user in ('authenticated', 'anon') then
    foreach k in array c_protected loop
      if (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
        raise exception 'This field is managed by the workflow' using errcode = '42501', hint = 'user';
      end if;
    end loop;
  end if;
  return new;
end $$;
create trigger leave_guard before update on public.leave_applications
  for each row execute function public.guard_workflow_columns();
create trigger attendance_corrections_guard before update on public.attendance_corrections
  for each row execute function public.guard_workflow_columns();
create trigger hr_requests_guard before update on public.hr_requests
  for each row execute function public.guard_workflow_columns();

-- Leave days default to working days; they can never exceed the calendar span.
create function public.leave_days_default() returns trigger
language plpgsql as $$
begin
  if new.days is null then
    new.days := public.working_days(new.date_from, new.date_to);
  end if;
  if new.days <= 0 or new.days > (new.date_to - new.date_from + 1) then
    raise exception 'Invalid number of leave days' using errcode = '22023', hint = 'user';
  end if;
  return new;
end $$;
create trigger leave_days before insert or update of date_from, date_to, days on public.leave_applications
  for each row execute function public.leave_days_default();

-- Final approval deducts the balance (only for types configured to deduct).
create function public.leave_apply_balance() returns trigger
language plpgsql security definer set search_path = public as $$
declare lt public.leave_types;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    select * into lt from public.leave_types where code = new.leave_type_code;
    if lt.deducts_balance then
      insert into public.leave_balances as b (employee_id, leave_type_code, year, used)
      values (new.employee_id, new.leave_type_code, extract(year from new.date_from)::int, new.days)
      on conflict (employee_id, leave_type_code, year) do update set used = b.used + new.days;
    end if;
  end if;
  return new;
end $$;
create trigger leave_balance_deduct after update of status on public.leave_applications
  for each row execute function public.leave_apply_balance();

-- Once HR finalizes an attendance correction, the DTR is updated.
create function public.attendance_apply_correction() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    insert into public.attendance_records as a
      (employee_id, work_date, time_in, time_out, status_code, remarks, source)
    values (
      new.employee_id, new.work_date, new.proposed_time_in, new.proposed_time_out,
      case when new.proposed_time_in is not null and new.proposed_time_out is not null then 'PRESENT' else 'MISSING_LOG' end,
      'Corrected via ' || new.request_no, 'correction')
    on conflict (employee_id, work_date) do update
      set time_in = coalesce(excluded.time_in, a.time_in),
          time_out = coalesce(excluded.time_out, a.time_out),
          status_code = case when coalesce(excluded.time_in, a.time_in) is not null
                              and coalesce(excluded.time_out, a.time_out) is not null
                             then 'PRESENT' else a.status_code end,
          remarks = excluded.remarks,
          source = 'correction';
  end if;
  return new;
end $$;
create trigger attendance_correction_apply after update of status on public.attendance_corrections
  for each row execute function public.attendance_apply_correction();

-- Balance summary (pending = filed but not yet decided).
create view public.leave_balance_summary
with (security_invoker = true) as
select
  b.employee_id, b.leave_type_code, lt.name as leave_type_name, b.year,
  b.beginning, b.earned, b.used,
  coalesce(p.pending, 0) as pending,
  b.beginning + b.earned - b.used - coalesce(p.pending, 0) as available
from public.leave_balances b
join public.leave_types lt on lt.code = b.leave_type_code
left join lateral (
  select sum(a.days) as pending
  from public.leave_applications a
  where a.employee_id = b.employee_id and a.leave_type_code = b.leave_type_code
    and a.status = 'in_review' and extract(year from a.date_from) = b.year
) p on true;
