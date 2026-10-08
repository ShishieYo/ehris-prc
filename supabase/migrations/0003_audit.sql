-- 0003_audit.sql
-- AUDIT DATA: append-only record of who did what. Nobody (including the
-- service role) can update or delete rows; normal users cannot insert at all.
set search_path = public, extensions;

create table public.audit_logs (
  id                  bigint generated always as identity primary key,
  occurred_at         timestamptz not null default now(),
  actor_user_id       uuid,
  actor_label         text not null,
  action              text not null,
  module              text not null,
  entity_type         text,
  entity_id           text,
  subject_employee_id uuid,
  old_values          jsonb,
  new_values          jsonb,
  reason              text,
  metadata            jsonb not null default '{}'::jsonb
);
create index audit_logs_occurred_idx on public.audit_logs(occurred_at desc);
create index audit_logs_subject_idx on public.audit_logs(subject_employee_id, occurred_at desc);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);
create index audit_logs_actor_idx on public.audit_logs(actor_user_id, occurred_at desc);

create function public.audit_logs_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'Audit records are immutable' using errcode = '42501', hint = 'user';
end $$;
create trigger audit_logs_no_update before update or delete on public.audit_logs
  for each row execute function public.audit_logs_immutable();
create trigger audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function public.audit_logs_immutable();

-- Network / device metadata is only captured when the agency has enabled it
-- (system setting audit.capture_network_metadata). Headers are supplied by the
-- application server (x-client-ip / x-client-ua) and by the API gateway.
create function public.audit_request_metadata() returns jsonb
language plpgsql stable set search_path = public as $$
declare
  v_headers jsonb;
begin
  if coalesce(public.setting_text('audit.capture_network_metadata', 'false'), 'false') <> 'true' then
    return '{}'::jsonb;
  end if;
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;
  if v_headers is null then
    return '{}'::jsonb;
  end if;
  return jsonb_strip_nulls(jsonb_build_object(
    'client_ip', v_headers ->> 'x-client-ip',
    'forwarded_for', v_headers ->> 'x-forwarded-for',
    'user_agent', coalesce(v_headers ->> 'x-client-ua', v_headers ->> 'user-agent')
  ));
end $$;

create function public.audit_actor_label() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select display_name from public.profiles where user_id = auth.uid()),
    case when auth.uid() is null then 'system' else 'unknown user' end
  )
$$;

-- Generic row-change trigger. Args: module [, 'redact'].
-- With 'redact' the changed field names are kept but values are masked so
-- identifiers (TIN, GSIS, etc.) never leak into the audit trail.
create function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_module text := tg_argv[0];
  v_redact boolean := coalesce(tg_argv[1], '') = 'redact';
  v_old    jsonb;
  v_new    jsonb;
  v_ref    jsonb;
  v_oldc   jsonb := '{}'::jsonb;
  v_newc   jsonb := '{}'::jsonb;
  v_key    text;
  v_subject uuid;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_ref := v_new;
    v_newc := v_new;
  elsif tg_op = 'DELETE' then
    v_old := to_jsonb(old);
    v_ref := v_old;
    v_oldc := v_old;
  else
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_ref := v_new;
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key <> 'updated_at' and (v_new -> v_key) is distinct from (v_old -> v_key) then
        v_oldc := v_oldc || jsonb_build_object(v_key, v_old -> v_key);
        v_newc := v_newc || jsonb_build_object(v_key, v_new -> v_key);
      end if;
    end loop;
    if v_newc = '{}'::jsonb then
      return new;
    end if;
  end if;

  if v_redact then
    select coalesce(jsonb_object_agg(k, '[redacted]'), '{}'::jsonb) into v_oldc from jsonb_object_keys(v_oldc) k;
    select coalesce(jsonb_object_agg(k, '[redacted]'), '{}'::jsonb) into v_newc from jsonb_object_keys(v_newc) k;
  end if;

  v_subject := coalesce(
    nullif(v_ref ->> 'employee_id', '')::uuid,
    case when tg_table_name = 'employees' then (v_ref ->> 'id')::uuid end
  );

  insert into public.audit_logs (
    actor_user_id, actor_label, action, module, entity_type, entity_id,
    subject_employee_id, old_values, new_values, reason, metadata
  ) values (
    auth.uid(), public.audit_actor_label(), tg_table_name || '.' || lower(tg_op), v_module, tg_table_name,
    coalesce(v_ref ->> 'id', v_ref ->> 'employee_id', v_ref ->> 'user_id', v_ref ->> 'code', v_ref ->> 'key',
             v_ref ->> 'role_id'),
    v_subject,
    nullif(v_oldc, '{}'::jsonb), nullif(v_newc, '{}'::jsonb),
    nullif(current_setting('app.change_reason', true), ''),
    public.audit_request_metadata()
  );
  return coalesce(new, old);
end $$;

-- Explicit business events logged by the application (reads, downloads, login).
-- Only an allow-list of actions is accepted so the audit trail cannot be
-- flooded with arbitrary caller-chosen records.
create function public.log_event(
  p_action              text,
  p_module              text,
  p_entity_type         text default null,
  p_entity_id           text default null,
  p_subject_employee_id uuid default null,
  p_metadata            jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  c_allowed text[] := array[
    'auth.login', 'auth.logout', 'auth.password_reset_requested', 'auth.password_changed',
    'document.viewed', 'document.downloaded',
    'employee.viewed', 'employee.sensitive_viewed',
    'pds.viewed', 'pds.downloaded', 'pds.certified',
    'report.generated', 'report.exported',
    'privacy.acknowledged', 'import.previewed'];
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000', hint = 'user';
  end if;
  if p_action <> all (c_allowed) then
    raise exception 'Unsupported audit action' using errcode = '22023', hint = 'user';
  end if;
  if p_action in ('document.viewed', 'document.downloaded') then
    if p_entity_id is null or not public.can_read_document(p_entity_id::uuid) then
      raise exception 'Not authorized' using errcode = '42501', hint = 'user';
    end if;
  end if;
  insert into public.audit_logs (
    actor_user_id, actor_label, action, module, entity_type, entity_id, subject_employee_id, metadata
  ) values (
    auth.uid(), public.audit_actor_label(), p_action, p_module, p_entity_type, p_entity_id,
    p_subject_employee_id, coalesce(p_metadata, '{}'::jsonb) || public.audit_request_metadata()
  );
end $$;

-- Field-level change history for one employee record (with reasons). Values of
-- sensitive identifiers are already masked in the audit trail.
create function public.employee_change_history(p_employee uuid)
returns table (
  occurred_at timestamptz,
  changed_by  text,
  table_name  text,
  field       text,
  old_value   text,
  new_value   text,
  reason      text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.has_permission('employee.read_all') or public.has_permission('audit.read')) then
    raise exception 'Not authorized' using errcode = '42501', hint = 'user';
  end if;
  return query
    select a.occurred_at, a.actor_label, a.entity_type, n.key,
           a.old_values ->> n.key, n.value #>> '{}', a.reason
    from public.audit_logs a
    cross join lateral jsonb_each(a.new_values) n
    where a.module = 'employee'
      and a.subject_employee_id = p_employee
      and a.action in ('employees.update', 'employee_private.update', 'employee_addresses.update')
    order by a.occurred_at desc, n.key;
end $$;
