-- 0007_notifications_imports.sql
set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Notifications. In-app rows are written immediately; every additional channel
-- enabled in system_settings (notifications.channels) gets an outbox row that
-- a delivery worker consumes. No external provider is wired in here.
-- ---------------------------------------------------------------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(user_id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text,
  link        text,
  entity_type text,
  entity_id   uuid,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);
create index notifications_unread_idx on public.notifications(user_id) where read_at is null;

create table public.notification_outbox (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  channel         text not null check (channel in ('email', 'sms')),
  status          text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts        int not null default 0,
  last_error      text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);
create index notification_outbox_pending_idx on public.notification_outbox(created_at) where status = 'pending';

-- Internal: not granted to end users (see 0009).
create function public.notify(
  p_user_id uuid, p_type text, p_title text, p_body text default null,
  p_link text default null, p_entity_type text default null, p_entity_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_channel text;
  v_channels jsonb := coalesce((select value from public.system_settings where key = 'notifications.channels'),
                               '["in_app"]'::jsonb);
begin
  if not exists (select 1 from public.profiles where user_id = p_user_id and is_active) then
    return null;
  end if;
  insert into public.notifications (user_id, type, title, body, link, entity_type, entity_id)
  values (p_user_id, p_type, p_title, p_body, p_link, p_entity_type, p_entity_id)
  returning id into v_id;
  for v_channel in select jsonb_array_elements_text(v_channels) loop
    if v_channel in ('email', 'sms') then
      insert into public.notification_outbox (notification_id, channel) values (v_id, v_channel);
    end if;
  end loop;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Data import (staging first, nothing touches master data until confirmed)
-- ---------------------------------------------------------------------------
create table public.import_batches (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in ('employees')),
  file_name      text not null,
  status         text not null default 'validated'
                   check (status in ('validated', 'committed', 'cancelled')),
  mapping        jsonb not null default '{}'::jsonb,
  total_rows     int not null default 0,
  valid_rows     int not null default 0,
  error_rows     int not null default 0,
  imported_rows  int not null default 0,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  committed_at   timestamptz
);

create table public.import_rows (
  id         bigint generated always as identity primary key,
  batch_id   uuid not null references public.import_batches(id) on delete cascade,
  row_no     int not null,
  raw        jsonb not null,
  normalized jsonb,   -- {"core": {...}, "private": {...}} ready for hr_save_employee
  errors     jsonb not null default '[]'::jsonb,
  status     text not null check (status in ('valid', 'error', 'imported', 'import_failed')),
  result     text,
  unique (batch_id, row_no)
);

-- Create employee records from the valid rows of a validated batch. Each row is
-- its own sub-transaction: a row the database rejects is recorded as
-- import_failed with the reason instead of aborting or being silently skipped.
create function public.commit_employee_import(p_batch uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b public.import_batches;
  r public.import_rows;
  v_ok int := 0;
  v_fail int := 0;
begin
  if not public.has_permission('import.run') then
    raise exception 'Not authorized' using errcode = '42501', hint = 'user';
  end if;
  select * into b from public.import_batches where id = p_batch for update;
  if not found or b.status <> 'validated' then
    raise exception 'This import can no longer be committed' using errcode = '22023', hint = 'user';
  end if;
  perform set_config('app.change_reason', 'Imported from batch ' || p_batch, true);

  for r in select * from public.import_rows where batch_id = p_batch and status = 'valid' order by row_no loop
    begin
      perform public.hr_save_employee(null, r.normalized -> 'core', r.normalized -> 'private',
                                      'Imported from batch ' || p_batch);
      update public.import_rows set status = 'imported' where id = r.id;
      v_ok := v_ok + 1;
    exception when others then
      update public.import_rows set status = 'import_failed', result = sqlerrm where id = r.id;
      v_fail := v_fail + 1;
    end;
  end loop;

  update public.import_batches
  set status = 'committed', committed_at = now(), imported_rows = v_ok
  where id = p_batch;
  return jsonb_build_object('imported', v_ok, 'failed', v_fail);
end $$;
