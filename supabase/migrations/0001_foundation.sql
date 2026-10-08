-- 0001_foundation.sql
-- Master data that is configured by administrators (no code change required):
-- organizational structure, positions, plantilla, lookups, settings.
set search_path = public, extensions;

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- Utilities
-- ---------------------------------------------------------------------------
create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Configurable lookup tables (MASTER DATA). Codes are stable identifiers,
-- names are display labels. is_active=false hides a value without losing history.
-- ---------------------------------------------------------------------------
create table public.org_unit_types (
  code        text primary key,
  name        text not null,
  sort_order  int  not null default 0,
  is_active   boolean not null default true
);

create table public.employment_statuses (
  code        text primary key,
  name        text not null,
  description text,
  sort_order  int  not null default 0,
  is_active   boolean not null default true
);

create table public.appointment_natures (
  code        text primary key,
  name        text not null,
  sort_order  int  not null default 0,
  is_active   boolean not null default true
);

-- ---------------------------------------------------------------------------
-- Organizational structure (Regional Office > Division > Section > Unit ...)
-- ---------------------------------------------------------------------------
create table public.org_units (
  id               uuid primary key default gen_random_uuid(),
  parent_id        uuid references public.org_units(id) on delete restrict,
  unit_type        text not null references public.org_unit_types(code),
  code             text not null unique,
  name             text not null,
  head_employee_id uuid,  -- FK added once employees exists
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index org_units_parent_idx on public.org_units(parent_id);
create trigger org_units_updated_at before update on public.org_units
  for each row execute function public.set_updated_at();

create function public.org_units_prevent_cycle() returns trigger
language plpgsql as $$
begin
  if new.parent_id is null then
    return new;
  end if;
  if new.parent_id = new.id then
    raise exception 'An organizational unit cannot be its own parent' using errcode = '23514';
  end if;
  if exists (
    with recursive up as (
      select id, parent_id from public.org_units where id = new.parent_id
      union all
      select o.id, o.parent_id from public.org_units o join up on o.id = up.parent_id
    )
    select 1 from up where id = new.id
  ) then
    raise exception 'Organizational unit hierarchy cannot contain a cycle' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger org_units_no_cycle before insert or update of parent_id on public.org_units
  for each row execute function public.org_units_prevent_cycle();

-- Every unit with each of its ancestors (depth 0 = itself). Used to resolve
-- "which division / section is this unit in" without hard-coding levels.
create view public.org_unit_ancestry
with (security_invoker = true) as
with recursive a as (
  select id as unit_id, id as ancestor_id, 0 as depth from public.org_units
  union all
  select a.unit_id, o.parent_id, a.depth + 1
  from a join public.org_units o on o.id = a.ancestor_id
  where o.parent_id is not null
)
select unit_id, ancestor_id, depth from a;

-- ---------------------------------------------------------------------------
-- Positions and plantilla items
-- ---------------------------------------------------------------------------
create table public.positions (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  title        text not null,
  salary_grade smallint check (salary_grade between 1 and 33),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger positions_updated_at before update on public.positions
  for each row execute function public.set_updated_at();

create table public.plantilla_items (
  id           uuid primary key default gen_random_uuid(),
  item_number  text not null unique,
  position_id  uuid not null references public.positions(id),
  org_unit_id  uuid not null references public.org_units(id),
  salary_grade smallint check (salary_grade between 1 and 33),
  is_active    boolean not null default true,
  remarks      text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger plantilla_items_updated_at before update on public.plantilla_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- System settings (non-secret configuration only. Secrets live in environment
-- variables, never in the database.)
-- ---------------------------------------------------------------------------
create table public.system_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);

create function public.setting_text(p_key text, p_default text default null) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select value #>> '{}' from public.system_settings where key = p_key), p_default)
$$;

-- Holidays (administrator maintained; no holiday list is assumed by the system).
create table public.holidays (
  holiday_date date primary key,
  name         text not null,
  kind         text not null default 'regular'
);

-- ---------------------------------------------------------------------------
-- Document numbering: HR-2026-000123 style identifiers, gap-tolerant counters.
-- ---------------------------------------------------------------------------
create table public.number_counters (
  prefix     text not null,
  year       int  not null,
  last_value int  not null default 0,
  primary key (prefix, year)
);

create function public.next_number(p_prefix text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_year int := extract(year from (now() at time zone 'Asia/Manila'))::int;
  v_val  int;
begin
  insert into public.number_counters as c (prefix, year, last_value)
  values (p_prefix, v_year, 1)
  on conflict (prefix, year) do update set last_value = c.last_value + 1
  returning last_value into v_val;
  return p_prefix || '-' || v_year || '-' || lpad(v_val::text, 6, '0');
end $$;

-- Working days between two dates (Mon-Fri, excluding configured holidays).
create function public.working_days(p_from date, p_to date) returns int
language sql stable set search_path = public as $$
  select count(*)::int
  from generate_series(p_from, p_to, interval '1 day') d
  where extract(isodow from d) < 6
    and not exists (select 1 from public.holidays h where h.holiday_date = d::date)
$$;
