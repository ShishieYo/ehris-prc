-- Creates the FIRST Super Administrator profile in a new (non-demo) project.
--
-- 1. Invite or create the person in Supabase Dashboard → Authentication → Users
--    (use an agency email; they set their own password).
-- 2. Run, as the database owner:
--      psql "$DATABASE_URL" -1 \
--        -v admin_email="'first.admin@your-agency.example'" \
--        -v admin_name="'Full Name'" \
--        -f supabase/bootstrap_admin.sql
-- 3. Sign in; invite everyone else from Administration → Users.
--
-- If the auth account does not exist nothing is changed and the final query returns no row.
\set ON_ERROR_STOP on

insert into public.profiles (user_id, email, display_name)
select id, lower(email), :admin_name
from auth.users
where lower(email) = lower(:admin_email)
on conflict (user_id) do update set is_active = true;

insert into public.user_roles (user_id, role_id)
select u.id, r.id
from auth.users u
join public.roles r on r.code = 'SUPER_ADMIN'
where lower(u.email) = lower(:admin_email)
on conflict do nothing;

select p.display_name, p.email, r.code as role
from public.profiles p
join public.user_roles ur on ur.user_id = p.user_id
join public.roles r on r.id = ur.role_id
where lower(p.email) = lower(:admin_email);
