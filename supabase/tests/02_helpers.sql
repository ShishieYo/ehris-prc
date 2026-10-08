-- Test helpers (test-only). Impersonate users the way PostgREST does: set the
-- JWT claims GUC and switch to the `authenticated` role.
create schema if not exists t;
grant usage on schema t to anon, authenticated;

create function t.uid(p_email text) returns uuid language sql stable security definer as
  $$ select id from auth.users where email = p_email $$;

create function t.as_user(p_email text) returns void language plpgsql as $$
declare v uuid := t.uid(p_email);
begin
  if v is null then raise exception 'no such test user %', p_email; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function t.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
end $$;

create function t.as_admin() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end $$;

create function t.emp(p_no text) returns uuid language sql stable security definer as
  $$ select id from public.employees where employee_no = p_no $$;

create function t.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FAIL: %', p_msg; end if;
  raise notice 'ok   %', p_msg;
end $$;

create function t.count(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute 'select count(*) from (' || p_sql || ') q' into n;
  return n;
end $$;

-- Expect the statement to raise. p_state (optional) is the expected SQLSTATE.
create function t.fails(p_sql text, p_msg text, p_state text default null) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if p_state is not null and sqlstate <> p_state then
      raise exception 'FAIL: % (expected %, got % %)', p_msg, p_state, sqlstate, sqlerrm;
    end if;
    raise notice 'ok   % [%]', p_msg, left(sqlerrm, 70);
    return;
  end;
  raise exception 'FAIL: % (statement succeeded)', p_msg;
end $$;

-- Expect a DML statement to affect exactly p_rows rows (RLS filtering is silent).
create function t.affects(p_sql text, p_rows int, p_msg text) returns void language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  if n <> p_rows then raise exception 'FAIL: % (affected %, expected %)', p_msg, n, p_rows; end if;
  raise notice 'ok   %', p_msg;
end $$;

grant execute on all functions in schema t to anon, authenticated;
