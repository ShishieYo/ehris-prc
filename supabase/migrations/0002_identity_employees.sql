-- 0002_identity_employees.sql
-- Identity (profiles, roles, permissions), the employee master record and the
-- access-control helper functions that every RLS policy builds on.
set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- RBAC catalogue
-- ---------------------------------------------------------------------------
create table public.permissions (
  code        text primary key,
  module      text not null,
  description text not null
);

create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.role_permissions (
  role_id         uuid not null references public.roles(id) on delete cascade,
  permission_code text not null references public.permissions(code) on delete cascade,
  primary key (role_id, permission_code)
);

-- ---------------------------------------------------------------------------
-- Employee master record (MASTER DATA)
-- Split by sensitivity: `employees` is organizational information visible to
-- HR, the employee and their supervisors; `employee_private` holds personal
-- and government identifiers visible only to the employee and to holders of
-- employee.read_sensitive.
-- ---------------------------------------------------------------------------
create sequence public.employee_no_seq;

create table public.employees (
  id                        uuid primary key default gen_random_uuid(),
  employee_no               text not null unique
                              default ('EMP-' || lpad(nextval('public.employee_no_seq')::text, 6, '0')),
  prc_employee_no           text unique,
  first_name                text not null check (length(btrim(first_name)) > 0),
  middle_name               text,
  last_name                 text not null check (length(btrim(last_name)) > 0),
  extension_name            text,
  sex                       text check (sex in ('male', 'female')),
  official_email            text check (official_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  position_id               uuid references public.positions(id),
  plantilla_item_id         uuid references public.plantilla_items(id),
  position_number           text,
  salary_grade              smallint check (salary_grade between 1 and 33),
  salary_step               smallint check (salary_step between 1 and 8),
  employment_status_code    text references public.employment_statuses(code),
  appointment_nature_code   text references public.appointment_natures(code),
  original_appointment_date date,
  current_appointment_date  date,
  date_assumed              date,
  org_unit_id               uuid references public.org_units(id),
  supervisor_employee_id    uuid references public.employees(id),
  record_status             text not null default 'active'
                              check (record_status in ('active', 'inactive', 'separated')),
  separation_date           date,
  created_by                uuid default auth.uid(),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  check (current_appointment_date is null or original_appointment_date is null
         or current_appointment_date >= original_appointment_date),
  check (separation_date is null or original_appointment_date is null
         or separation_date >= original_appointment_date),
  check (supervisor_employee_id is null or supervisor_employee_id <> id)
);
create index employees_org_unit_idx on public.employees(org_unit_id);
create index employees_supervisor_idx on public.employees(supervisor_employee_id);
create index employees_name_idx on public.employees(lower(last_name), lower(first_name));
-- A plantilla item has at most one active incumbent.
create unique index employees_plantilla_active_uq
  on public.employees(plantilla_item_id)
  where plantilla_item_id is not null and record_status = 'active';
create trigger employees_updated_at before update on public.employees
  for each row execute function public.set_updated_at();

alter table public.org_units
  add constraint org_units_head_fk foreign key (head_employee_id)
  references public.employees(id) on delete set null;

create table public.employee_private (
  employee_id    uuid primary key references public.employees(id) on delete cascade,
  birth_date     date check (birth_date >= date '1900-01-01' and birth_date < current_date),
  birth_place    text,
  civil_status   text check (civil_status in ('single', 'married', 'widowed', 'separated', 'annulled', 'other')),
  citizenship    text,
  blood_type     text check (blood_type in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  tin            text check (tin ~ '^[0-9-]{9,15}$'),
  gsis_bp_no     text check (gsis_bp_no ~ '^[0-9-]{9,15}$'),
  philhealth_no  text check (philhealth_no ~ '^[0-9-]{9,15}$'),
  pagibig_no     text check (pagibig_no ~ '^[0-9-]{9,15}$'),
  personal_email text check (personal_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  mobile_no      text check (mobile_no ~ '^[0-9+() -]{7,20}$'),
  updated_at     timestamptz not null default now()
);
-- Government identifiers must be unique across the workforce.
create unique index employee_private_tin_uq on public.employee_private(tin) where tin is not null;
create unique index employee_private_gsis_uq on public.employee_private(gsis_bp_no) where gsis_bp_no is not null;
create unique index employee_private_philhealth_uq on public.employee_private(philhealth_no) where philhealth_no is not null;
create unique index employee_private_pagibig_uq on public.employee_private(pagibig_no) where pagibig_no is not null;
create trigger employee_private_updated_at before update on public.employee_private
  for each row execute function public.set_updated_at();

create table public.employee_addresses (
  id                uuid primary key default gen_random_uuid(),
  employee_id       uuid not null references public.employees(id) on delete cascade,
  address_type      text not null check (address_type in ('residential', 'permanent')),
  house_no          text,
  street            text,
  subdivision       text,
  barangay          text,
  city_municipality text,
  province          text,
  zip_code          text,
  updated_at        timestamptz not null default now(),
  unique (employee_id, address_type)
);
create trigger employee_addresses_updated_at before update on public.employee_addresses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profiles: link between an authentication identity and an employee record.
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id                  uuid primary key references auth.users(id) on delete cascade,
  employee_id              uuid unique references public.employees(id) on delete set null,
  display_name             text not null,
  email                    text,
  is_active                boolean not null default true,
  privacy_acknowledged_at  timestamptz,
  privacy_notice_version   text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create unique index profiles_email_uq on public.profiles (lower(email)) where email is not null;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.user_roles (
  user_id    uuid not null references public.profiles(user_id) on delete cascade,
  role_id    uuid not null references public.roles(id) on delete cascade,
  granted_by uuid default auth.uid(),
  granted_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

-- ---------------------------------------------------------------------------
-- Access helpers. SECURITY DEFINER so they can read the RBAC tables regardless
-- of the caller's own RLS; they only ever answer questions about auth.uid().
-- ---------------------------------------------------------------------------
create function public.current_employee_id() returns uuid
language sql stable security definer set search_path = public as $$
  select employee_id from public.profiles where user_id = auth.uid() and is_active
$$;

create function public.has_permission(p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.profiles pr
    join public.user_roles ur on ur.user_id = pr.user_id
    join public.role_permissions rp on rp.role_id = ur.role_id
    where pr.user_id = auth.uid() and pr.is_active and rp.permission_code = p_code
  )
$$;

create function public.has_role(p_role_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.profiles pr
    join public.user_roles ur on ur.user_id = pr.user_id
    join public.roles r on r.id = ur.role_id
    where pr.user_id = auth.uid() and pr.is_active and r.code = p_role_code
  )
$$;

-- All units headed by an employee, including every descendant unit.
create function public.headed_unit_ids(p_employee uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  with recursive t as (
    select id from public.org_units where head_employee_id = p_employee and is_active
    union all
    select o.id from public.org_units o join t on o.parent_id = t.id
  )
  select id from t
$$;

-- True when the caller supervises the target employee: direct supervisor, or
-- head of the target's unit (or of any ancestor unit). Requires team.view so
-- the relationship alone never grants access without the role.
create function public.supervises(p_employee uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_permission('team.view')
    and p_employee is distinct from public.current_employee_id()
    and exists (
      select 1 from public.employees e
      where e.id = p_employee
        and (
          e.supervisor_employee_id = public.current_employee_id()
          or e.org_unit_id in (select public.headed_unit_ids(public.current_employee_id()))
        )
    )
$$;

create function public.is_self(p_employee uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_employee is not null and p_employee = public.current_employee_id()
$$;

create function public.can_read_employee(p_employee uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_self(p_employee)
      or public.has_permission('employee.read_all')
      or public.supervises(p_employee)
$$;

-- User ids that currently hold a permission (used to route notifications).
create function public.users_with_permission(p_code text) returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct pr.user_id
  from public.profiles pr
  join public.user_roles ur on ur.user_id = pr.user_id
  join public.role_permissions rp on rp.role_id = ur.role_id
  where pr.is_active and rp.permission_code = p_code
$$;

-- User ids of the people who supervise an employee.
create function public.supervisor_user_ids(p_employee uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct pr.user_id
  from public.profiles pr
  join public.employees e on e.id = p_employee
  where pr.is_active
    and pr.employee_id is not null
    and pr.employee_id <> p_employee
    and (
      pr.employee_id = e.supervisor_employee_id
      or pr.employee_id in (
        select o.head_employee_id from public.org_units o
        where o.head_employee_id is not null
          and o.id in (select ancestor_id from public.org_unit_ancestry where unit_id = e.org_unit_id)
      )
    )
$$;

-- ---------------------------------------------------------------------------
-- Directory view: RLS of `employees` applies (security_invoker), so each user
-- only ever sees the rows they are entitled to.
-- ---------------------------------------------------------------------------
create view public.employee_directory
with (security_invoker = true) as
select
  e.id,
  e.employee_no,
  e.last_name || ', ' || e.first_name
    || coalesce(' ' || nullif(e.middle_name, ''), '')
    || coalesce(' ' || nullif(e.extension_name, ''), '') as full_name,
  e.first_name,
  e.last_name,
  e.position_id,
  p.title as position_title,
  e.salary_grade,
  e.salary_step,
  e.employment_status_code,
  s.name as employment_status_name,
  e.org_unit_id,
  u.name as unit_name,
  div.id as division_id,
  div.name as division_name,
  e.supervisor_employee_id,
  e.record_status
from public.employees e
left join public.positions p on p.id = e.position_id
left join public.employment_statuses s on s.code = e.employment_status_code
left join public.org_units u on u.id = e.org_unit_id
left join lateral (
  select d.id, d.name
  from public.org_unit_ancestry a
  join public.org_units d on d.id = a.ancestor_id and d.unit_type = 'division'
  where a.unit_id = e.org_unit_id
  order by a.depth
  limit 1
) div on true;

-- ---------------------------------------------------------------------------
-- Employee write path. All HR writes go through this function so permission
-- checks, protected fields, the change reason and validation live in one place.
-- ---------------------------------------------------------------------------
create function public.hr_save_employee(
  p_employee_id uuid,
  p_core        jsonb,
  p_private     jsonb,
  p_reason      text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c_core text[] := array[
    'employee_no', 'prc_employee_no', 'first_name', 'middle_name', 'last_name', 'extension_name', 'sex',
    'official_email', 'position_id', 'plantilla_item_id', 'position_number', 'salary_grade', 'salary_step',
    'employment_status_code', 'appointment_nature_code', 'original_appointment_date',
    'current_appointment_date', 'date_assumed', 'org_unit_id', 'supervisor_employee_id',
    'record_status', 'separation_date'];
  c_protected text[] := array['record_status', 'separation_date', 'employment_status_code'];
  c_private text[] := array[
    'birth_date', 'birth_place', 'civil_status', 'citizenship', 'blood_type', 'tin', 'gsis_bp_no',
    'philhealth_no', 'pagibig_no', 'personal_email', 'mobile_no'];
  v_id   uuid := p_employee_id;
  k      text;
  v_cols text[] := '{}';
  v_sets text[] := '{}';
begin
  if not public.has_permission('employee.write') then
    raise exception 'Not authorized' using errcode = '42501', hint = 'user';
  end if;
  p_core := coalesce(p_core, '{}'::jsonb);
  p_private := coalesce(p_private, '{}'::jsonb);

  for k in select jsonb_object_keys(p_core) loop
    if k <> all (c_core) then
      raise exception 'Field % cannot be edited', k using errcode = '22023', hint = 'user';
    end if;
    if k = any (c_protected) and not public.has_permission('employee.manage_status') then
      raise exception 'Not authorized to change %', k using errcode = '42501', hint = 'user';
    end if;
    if v_id is not null and k = 'employee_no' then
      raise exception 'Employee number cannot be changed' using errcode = '22023', hint = 'user';
    end if;
    v_cols := v_cols || k;
  end loop;
  for k in select jsonb_object_keys(p_private) loop
    if k <> all (c_private) then
      raise exception 'Field % cannot be edited', k using errcode = '22023', hint = 'user';
    end if;
  end loop;
  if p_private <> '{}'::jsonb and not public.has_permission('employee.read_sensitive') then
    raise exception 'Not authorized' using errcode = '42501', hint = 'user';
  end if;

  if v_id is null then
    v_id := gen_random_uuid();
    execute format(
      'insert into public.employees (id, %1$s) select $2, %1$s from jsonb_populate_record(null::public.employees, $1)',
      (select string_agg(format('%I', c), ', ') from unnest(v_cols) c)
    ) using p_core, v_id;
  else
    if coalesce(btrim(p_reason), '') = '' and v_cols <> '{}' then
      raise exception 'A reason is required when changing an employee record' using errcode = '22023', hint = 'user';
    end if;
    perform set_config('app.change_reason', coalesce(p_reason, ''), true);
    if v_cols <> '{}' then
      select array_agg(format('%1$I = (r).%1$I', c)) into v_sets from unnest(v_cols) c;
      execute format(
        'update public.employees e set %s from (select jsonb_populate_record(null::public.employees, $1) as r) x where e.id = $2',
        array_to_string(v_sets, ', ')
      ) using p_core, v_id;
      if not found then
        raise exception 'Employee not found' using errcode = 'P0002', hint = 'user';
      end if;
    end if;
  end if;

  if p_private <> '{}'::jsonb then
    perform set_config('app.change_reason', coalesce(p_reason, ''), true);
    select array_agg(format('%I', c)) into v_cols from jsonb_object_keys(p_private) c;
    select array_agg(format('%1$I = excluded.%1$I', c)) into v_sets from jsonb_object_keys(p_private) c;
    execute format(
      'insert into public.employee_private (employee_id, %1$s) select $2, %1$s from jsonb_populate_record(null::public.employee_private, $1) on conflict (employee_id) do update set %2$s',
      array_to_string(v_cols, ', '), array_to_string(v_sets, ', ')
    ) using p_private, v_id;
  end if;
  return v_id;
end $$;

-- Self-service: employees may maintain only their own contact details.
create function public.update_my_contact(p_personal_email text, p_mobile_no text) returns void
language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.current_employee_id();
begin
  if v_emp is null then
    raise exception 'Not authorized' using errcode = '42501', hint = 'user';
  end if;
  insert into public.employee_private (employee_id, personal_email, mobile_no)
  values (v_emp, nullif(btrim(p_personal_email), ''), nullif(btrim(p_mobile_no), ''))
  on conflict (employee_id) do update
    set personal_email = excluded.personal_email, mobile_no = excluded.mobile_no;
end $$;

-- Records that the signed-in user has read the privacy notice.
create function public.acknowledge_privacy(p_version text) returns void
language sql security definer set search_path = public as $$
  update public.profiles
  set privacy_acknowledged_at = now(), privacy_notice_version = p_version
  where user_id = auth.uid();
$$;

-- One round trip for "who am I and what may I do" (used on every request by the app).
create function public.my_access() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_build_object(
      'user_id', pr.user_id,
      'display_name', pr.display_name,
      'employee_id', pr.employee_id,
      'privacy_acknowledged_at', pr.privacy_acknowledged_at,
      'privacy_notice_version', pr.privacy_notice_version,
      'current_privacy_version', public.setting_text('privacy.notice_version', '1'),
      'roles', coalesce((select jsonb_agg(distinct r.code)
                         from public.user_roles ur join public.roles r on r.id = ur.role_id
                         where ur.user_id = pr.user_id), '[]'::jsonb),
      'permissions', coalesce((select jsonb_agg(distinct rp.permission_code)
                               from public.user_roles ur join public.role_permissions rp on rp.role_id = ur.role_id
                               where ur.user_id = pr.user_id), '[]'::jsonb))
    from public.profiles pr where pr.user_id = auth.uid() and pr.is_active
  ), 'null'::jsonb)
$$;
