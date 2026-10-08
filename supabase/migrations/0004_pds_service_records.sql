-- 0004_pds_service_records.sql
-- Digital Personal Data Sheet (normalized per section) and Service Record.
-- Section layout follows the commonly used government PDS structure; the exact
-- field list must be validated against the current CSC form revision before
-- the printed/PDF output is treated as an official document.
set search_path = public, extensions;

create table public.employee_family (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete cascade,
  relation      text not null check (relation in ('spouse', 'father', 'mother', 'child')),
  last_name     text not null,
  first_name    text not null,
  middle_name   text,
  extension_name text,
  birth_date    date check (birth_date >= date '1900-01-01'),
  occupation    text,
  employer      text,
  business_address text,
  telephone     text,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.employee_education (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete cascade,
  level         text not null check (level in ('elementary', 'secondary', 'vocational', 'college', 'graduate')),
  school        text not null,
  degree_course text,
  period_from   smallint check (period_from between 1900 and 2100),
  period_to     smallint check (period_to between 1900 and 2100),
  highest_level_units text,
  year_graduated smallint check (year_graduated between 1900 and 2100),
  honors        text,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (period_to is null or period_from is null or period_to >= period_from)
);

create table public.employee_eligibility (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.employees(id) on delete cascade,
  eligibility    text not null,
  rating         numeric(5, 2) check (rating between 0 and 100),
  exam_date      date,
  exam_place     text,
  license_number text,
  license_validity date,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.employee_work_experience (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references public.employees(id) on delete cascade,
  date_from        date not null,
  date_to          date,
  position_title   text not null,
  agency           text not null,
  monthly_salary   numeric(12, 2) check (monthly_salary >= 0),
  salary_grade_step text,
  appointment_status text,
  is_government    boolean not null default true,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (date_to is null or date_to >= date_from)
);

create table public.employee_voluntary_work (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete cascade,
  organization  text not null,
  date_from     date,
  date_to       date,
  hours         numeric(8, 2) check (hours >= 0),
  nature_of_work text,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (date_to is null or date_from is null or date_to >= date_from)
);

create table public.employee_training (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete cascade,
  title         text not null,
  date_from     date,
  date_to       date,
  hours         numeric(8, 2) check (hours >= 0),
  training_type text,
  conducted_by  text,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (date_to is null or date_from is null or date_to >= date_from)
);

create table public.employee_other_info (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  category    text not null check (category in ('skill', 'recognition', 'membership')),
  description text not null,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.employee_references (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  name        text not null,
  address     text,
  telephone   text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create function public.employee_references_limit() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.employee_references where employee_id = new.employee_id) >= 3 then
    raise exception 'A PDS carries at most three character references' using errcode = '23514', hint = 'user';
  end if;
  return new;
end $$;
create trigger employee_references_limit before insert on public.employee_references
  for each row execute function public.employee_references_limit();

create table public.employee_gov_ids (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete cascade,
  id_type       text not null,
  id_number     text not null,
  issued_at     text,
  issued_on     date,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Declaration questions are configurable master data (wording is maintained by
-- HR against the current form revision, not hard-coded).
create table public.pds_declaration_questions (
  code       text primary key,
  label      text not null,
  sort_order int not null default 0,
  is_active  boolean not null default true
);

create table public.pds_declaration_answers (
  employee_id   uuid not null references public.employees(id) on delete cascade,
  question_code text not null references public.pds_declaration_questions(code),
  answer        boolean not null,
  details       text,
  updated_at    timestamptz not null default now(),
  primary key (employee_id, question_code)
);

-- Certification (employee) and verification (HR) events. Append-only history.
create table public.pds_submissions (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  kind        text not null check (kind in ('certified', 'verified', 'returned')),
  by_user     uuid not null default auth.uid(),
  by_name     text not null,
  remarks     text,
  created_at  timestamptz not null default now()
);
create index pds_submissions_employee_idx on public.pds_submissions(employee_id, created_at desc);

create function public.pds_certify() returns uuid
language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.current_employee_id(); v_id uuid;
begin
  if v_emp is null then
    raise exception 'Not authorized' using errcode = '42501', hint = 'user';
  end if;
  insert into public.pds_submissions (employee_id, kind, by_user, by_name)
  values (v_emp, 'certified', auth.uid(), public.audit_actor_label())
  returning id into v_id;
  return v_id;
end $$;

create function public.pds_review(p_employee uuid, p_kind text, p_remarks text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.has_permission('pds.verify') then
    raise exception 'Not authorized' using errcode = '42501', hint = 'user';
  end if;
  if p_kind not in ('verified', 'returned') then
    raise exception 'Invalid review outcome' using errcode = '22023', hint = 'user';
  end if;
  if p_kind = 'returned' and coalesce(btrim(p_remarks), '') = '' then
    raise exception 'Remarks are required when returning a PDS' using errcode = '22023', hint = 'user';
  end if;
  insert into public.pds_submissions (employee_id, kind, by_user, by_name, remarks)
  values (p_employee, p_kind, auth.uid(), public.audit_actor_label(), p_remarks)
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Service record (TRANSACTION-style history, chronological, non-overlapping)
-- ---------------------------------------------------------------------------
create table public.service_records (
  id                 uuid primary key default gen_random_uuid(),
  employee_id        uuid not null references public.employees(id) on delete cascade,
  date_from          date not null,
  date_to            date,
  record_type        text not null default 'appointment'
                       check (record_type in ('appointment', 'promotion', 'transfer', 'salary_adjustment',
                                              'reinstatement', 'separation', 'other')),
  position_title     text not null,
  appointment_status text,
  office             text,
  station            text,
  monthly_salary     numeric(12, 2) check (monthly_salary >= 0),
  salary_grade       smallint check (salary_grade between 1 and 33),
  salary_step        smallint check (salary_step between 1 and 8),
  lwop_days          int not null default 0 check (lwop_days >= 0),
  separation_cause   text,
  remarks            text,
  document_id        uuid,  -- FK added with documents
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (date_to is null or date_to >= date_from),
  -- An employee cannot hold two overlapping service periods.
  constraint service_records_no_overlap
    exclude using gist (employee_id with =, daterange(date_from, date_to, '[]') with &&)
);
create index service_records_employee_idx on public.service_records(employee_id, date_from desc);
create trigger service_records_updated_at before update on public.service_records
  for each row execute function public.set_updated_at();

-- Current employment record derived from the service record (open-ended row).
create view public.current_service_record
with (security_invoker = true) as
select distinct on (employee_id) *
from public.service_records
where date_to is null or date_to >= current_date
order by employee_id, date_from desc;
