-- DEMO DATA — fictional people and values. Never load into a production database.
-- Requires the demo auth accounts to exist first (npm run demo:users, or the
-- test stub). Idempotent: refuses to run twice.
set search_path = public, extensions;
begin;

do $$
begin
  if exists (select 1 from public.employees where employee_no like 'DEMO-%') then
    raise exception 'Demo data is already loaded';
  end if;
  if (select count(*) from auth.users where email like '%@demo.prc3.example') < 8 then
    raise exception 'Create the demo auth accounts first (see README: Demo environment)';
  end if;
end $$;

insert into public.system_settings (key, value, description)
values ('demo.dataset', 'true', 'DEMO DATA is loaded in this database')
on conflict (key) do update set value = 'true';

-- Organization (DEMO)
insert into public.org_units (id, parent_id, unit_type, code, name) values
  ('a0000000-0000-0000-0000-000000000001', null, 'regional_office', 'RO3', 'PRC Region III'),
  ('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'office', 'ORD', 'Office of the Regional Director'),
  ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'division', 'LRD', 'Licensure and Registration Division'),
  ('a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003', 'section', 'LRD-REG', 'Registration Section'),
  ('a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000003', 'section', 'LRD-LIC', 'Licensure Section'),
  ('a0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'division', 'RD', 'Regulation Division'),
  ('a0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000006', 'section', 'RD-MON', 'Monitoring and Enforcement Section'),
  ('a0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'division', 'FAD', 'Finance and Administrative Division'),
  ('a0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000008', 'unit', 'FAD-HRMU', 'Human Resource Management Unit'),
  ('a0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000008', 'section', 'FAD-FIN', 'Finance Section'),
  ('a0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'section', 'LEGAL', 'Legal Section'),
  ('a0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'service_center', 'OSC-A', 'Offsite Service Center A (DEMO)');

-- Positions use placeholder salary grades for demonstration only.
insert into public.positions (id, code, title, salary_grade) values
  ('b0000000-0000-0000-0000-000000000001', 'REGDIR', 'Regional Director', 27),
  ('b0000000-0000-0000-0000-000000000002', 'CAO', 'Chief Administrative Officer', 24),
  ('b0000000-0000-0000-0000-000000000003', 'SPRO', 'Supervising Professional Regulation Officer', 22),
  ('b0000000-0000-0000-0000-000000000004', 'PRO1', 'Professional Regulation Officer I', 11),
  ('b0000000-0000-0000-0000-000000000005', 'AO4', 'Administrative Officer IV', 15),
  ('b0000000-0000-0000-0000-000000000006', 'AA3', 'Administrative Assistant III', 9),
  ('b0000000-0000-0000-0000-000000000007', 'ACCT2', 'Accountant II', 16),
  ('b0000000-0000-0000-0000-000000000008', 'ATTY3', 'Attorney III', 21),
  ('b0000000-0000-0000-0000-000000000009', 'AIDE4', 'Administrative Aide IV', 4);

-- Employees. employee_no is prefixed DEMO- so demo records are unmistakable.
create temp table _demo_emp (
  n int, first_name text, middle_name text, last_name text, sex text, pos int, unit int, status text,
  orig date, curr date, assumed date, sg int, step int, supervisor int, birth date, civil text
) on commit drop;
insert into _demo_emp values
  (1,  'Ricardo', 'Alvarez', 'Villanueva', 'male',   1, 2,  'PERMANENT',   '2008-02-01', '2020-01-15', '2020-01-20', 27, 3, null, '1971-05-09', 'married'),
  (2,  'Teresita', 'Mendoza', 'Navarro',   'female', 2, 8,  'PERMANENT',   '2004-06-15', '2017-03-01', '2017-03-06', 24, 4, 1,    '1976-11-22', 'married'),
  (3,  'Paolo', 'Delos Santos', 'Mercado', 'male',   6, 9,  'PERMANENT',   '2016-09-01', '2016-09-01', '2016-09-01', 9,  2, 2,    '1992-08-30', 'single'),
  (4,  'Lorna', 'Perez', 'Dizon',          'female', 3, 3,  'PERMANENT',   '2006-01-09', '2018-05-02', '2018-05-07', 22, 3, 1,    '1974-02-17', 'married'),
  (5,  'Juan', 'Santos', 'Dela Cruz',      'male',   4, 4,  'PERMANENT',   '2019-07-01', '2023-01-01', '2023-01-02', 11, 2, 4,    '1995-03-14', 'single'),
  (6,  'Ana Liza', 'Ramirez', 'Bautista',  'female', 4, 5,  'PERMANENT',   '2021-02-15', '2021-02-15', '2021-02-15', 11, 1, 4,    '1997-09-05', 'single'),
  (7,  'Eduardo', 'Salazar', 'Pascual',    'male',   5, 2,  'PERMANENT',   '2012-08-01', '2012-08-01', '2012-08-01', 15, 3, 1,    '1985-12-01', 'married'),
  (8,  'Rolando', 'Tolentino', 'Cabrera',  'male',   3, 6,  'PERMANENT',   '2007-03-12', '2019-09-02', '2019-09-02', 22, 2, 1,    '1978-04-27', 'married'),
  (9,  'Josefina', 'Ramos', 'Mendoza',     'female', 4, 7,  'COS',         '2024-01-02', '2024-01-02', '2024-01-02', null, null, 8, '1999-06-18', 'single'),
  (10, 'Bernardo', 'Cruz', 'Aguilar',      'male',   9, 9,  'JO',          '2025-03-03', '2025-03-03', '2025-03-03', null, null, 2, '2000-01-25', 'single'),
  (11, 'Remedios', 'Valdez', 'Lacson',     'female', 6, 5,  'CASUAL',      '2022-05-16', '2022-05-16', '2022-05-16', 9,  1, 4,    '1990-10-10', 'married'),
  -- planted for the data quality demo: assumed duty before appointment
  (12, 'Gilbert', 'Ortega', 'Soriano',     'male',   6, 4,  'CONTRACTUAL', '2023-04-03', '2023-04-03', '2023-03-20', 9,  1, 4,    '1993-07-07', 'single'),
  (13, 'Imelda', 'Villegas', 'Ramos',      'female', 7, 10, 'PERMANENT',   '2013-10-01', '2013-10-01', '2013-10-01', 16, 3, 2,    '1983-03-03', 'married'),
  (14, 'Danilo', 'Fernandez', 'Castillo',  'male',   8, 11, 'PERMANENT',   '2015-04-06', '2015-04-06', '2015-04-06', 21, 2, 1,    '1982-09-19', 'married');

insert into public.plantilla_items (id, item_number, position_id, org_unit_id, salary_grade, remarks)
select ('c0000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'DEMO-PI-' || lpad(n::text, 4, '0'),
       ('b0000000-0000-0000-0000-00000000000' || pos)::uuid,
       ('a0000000-0000-0000-0000-0000000000' || lpad(unit::text, 2, '0'))::uuid, sg, 'DEMO DATA'
from _demo_emp where status in ('PERMANENT');

insert into public.employees (
  id, employee_no, first_name, middle_name, last_name, sex, official_email, position_id, plantilla_item_id,
  salary_grade, salary_step, employment_status_code, appointment_nature_code, original_appointment_date,
  current_appointment_date, date_assumed, org_unit_id)
select ('e0000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'DEMO-' || lpad(n::text, 4, '0'),
       first_name, middle_name, last_name, sex,
       lower(replace(first_name, ' ', '')) || '.' || lower(replace(last_name, ' ', '')) || '@demo.prc3.example',
       ('b0000000-0000-0000-0000-00000000000' || pos)::uuid,
       case when status = 'PERMANENT' then ('c0000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid end,
       sg, step, status, case when orig = curr then 'ORIGINAL' else 'PROMOTION' end, orig, curr, assumed,
       ('a0000000-0000-0000-0000-0000000000' || lpad(unit::text, 2, '0'))::uuid
from _demo_emp;

update public.employees e
set supervisor_employee_id = ('e0000000-0000-0000-0000-0000000000' || lpad(d.supervisor::text, 2, '0'))::uuid
from _demo_emp d
where e.employee_no = 'DEMO-' || lpad(d.n::text, 4, '0') and d.supervisor is not null;

update public.org_units set head_employee_id = 'e0000000-0000-0000-0000-000000000001' where id in
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002');
update public.org_units set head_employee_id = 'e0000000-0000-0000-0000-000000000004' where id = 'a0000000-0000-0000-0000-000000000003';
update public.org_units set head_employee_id = 'e0000000-0000-0000-0000-000000000008' where id = 'a0000000-0000-0000-0000-000000000006';
update public.org_units set head_employee_id = 'e0000000-0000-0000-0000-000000000002' where id in
  ('a0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000009');
update public.org_units set head_employee_id = 'e0000000-0000-0000-0000-000000000013' where id = 'a0000000-0000-0000-0000-000000000010';
update public.org_units set head_employee_id = 'e0000000-0000-0000-0000-000000000014' where id = 'a0000000-0000-0000-0000-000000000011';

-- Personal and government identifiers: obviously synthetic sequences.
-- Bernardo (10) intentionally has no government numbers (data quality demo).
insert into public.employee_private (employee_id, birth_date, birth_place, civil_status, citizenship, blood_type,
                                     tin, gsis_bp_no, philhealth_no, pagibig_no, personal_email, mobile_no)
select ('e0000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, birth, 'Demo City', civil, 'Filipino',
       (array['A+', 'B+', 'O+', 'AB+', 'O-'])[1 + n % 5],
       case when n = 10 then null else '9000000' || lpad(n::text, 2, '0') end,
       case when n = 10 then null else '8000000' || lpad(n::text, 2, '0') end,
       case when n = 10 then null else '700000000' || lpad(n::text, 2, '0') end,
       case when n = 10 then null else '600000000' || lpad(n::text, 2, '0') end,
       lower(replace(first_name, ' ', '')) || '.personal@demo.example', '091700000' || lpad(n::text, 2, '0')
from _demo_emp;

insert into public.employee_addresses (employee_id, address_type, house_no, street, barangay, city_municipality, province, zip_code)
select ('e0000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'residential', (n * 7)::text, 'Demo Street',
       'Barangay Demo', 'Demo City', 'Demo Province', '2000'
from _demo_emp;

-- Service records (DEMO). Juan has a casual-to-permanent history.
insert into public.service_records (employee_id, date_from, date_to, record_type, position_title, appointment_status,
                                    office, station, monthly_salary, salary_grade, salary_step, remarks)
values
  ('e0000000-0000-0000-0000-000000000005', '2019-07-01', '2022-12-31', 'appointment', 'Administrative Assistant III', 'Casual',
   'Registration Section', 'PRC Region III', 20000, 9, 1, 'DEMO DATA'),
  ('e0000000-0000-0000-0000-000000000005', '2023-01-01', null, 'promotion', 'Professional Regulation Officer I', 'Permanent',
   'Registration Section', 'PRC Region III', 30000, 11, 2, 'DEMO DATA');
insert into public.service_records (employee_id, date_from, date_to, record_type, position_title, appointment_status,
                                    office, station, monthly_salary, salary_grade, salary_step, remarks)
select e.id, e.current_appointment_date, null, 'appointment', p.title, s.name, u.name, 'PRC Region III',
       25000, e.salary_grade, e.salary_step, 'DEMO DATA'
from public.employees e
join public.positions p on p.id = e.position_id
join public.employment_statuses s on s.code = e.employment_status_code
join public.org_units u on u.id = e.org_unit_id
where e.employee_no like 'DEMO-%' and e.employee_no <> 'DEMO-0005' and e.employee_no <> 'DEMO-0012';
-- DEMO-0012 deliberately has no service record (data quality demo).

-- Juan's PDS (DEMO)
insert into public.employee_family (employee_id, relation, last_name, first_name, middle_name, birth_date, occupation) values
  ('e0000000-0000-0000-0000-000000000005', 'father', 'Dela Cruz', 'Ernesto', 'Reyes', null, 'Retired'),
  ('e0000000-0000-0000-0000-000000000005', 'mother', 'Santos', 'Luzviminda', 'Garcia', null, 'Homemaker');
insert into public.employee_education (employee_id, level, school, degree_course, period_from, period_to, year_graduated, honors, sort_order) values
  ('e0000000-0000-0000-0000-000000000005', 'elementary', 'Demo Elementary School', null, 2001, 2007, 2007, null, 1),
  ('e0000000-0000-0000-0000-000000000005', 'secondary', 'Demo National High School', null, 2007, 2011, 2011, null, 2),
  ('e0000000-0000-0000-0000-000000000005', 'college', 'Demo State University', 'BS Public Administration', 2011, 2015, 2015, 'Cum Laude', 3);
insert into public.employee_eligibility (employee_id, eligibility, rating, exam_date, exam_place) values
  ('e0000000-0000-0000-0000-000000000005', 'Career Service Professional (DEMO)', 84.5, '2016-10-16', 'Demo City');
insert into public.employee_work_experience (employee_id, date_from, date_to, position_title, agency, monthly_salary, appointment_status, is_government) values
  ('e0000000-0000-0000-0000-000000000005', '2015-08-01', '2019-06-30', 'Administrative Aide', 'Demo Private Company', 15000, 'Contractual', false);
insert into public.employee_training (employee_id, title, date_from, date_to, hours, training_type, conducted_by) values
  ('e0000000-0000-0000-0000-000000000005', 'Customer Service Excellence (DEMO)', '2022-03-07', '2022-03-09', 24, 'Technical', 'Demo Training Institute');
insert into public.employee_references (employee_id, name, address, telephone) values
  ('e0000000-0000-0000-0000-000000000005', 'Reference One (DEMO)', 'Demo City', '09170000101'),
  ('e0000000-0000-0000-0000-000000000005', 'Reference Two (DEMO)', 'Demo City', '09170000102'),
  ('e0000000-0000-0000-0000-000000000005', 'Reference Three (DEMO)', 'Demo City', '09170000103');
insert into public.employee_gov_ids (employee_id, id_type, id_number, issued_at, issued_on) values
  ('e0000000-0000-0000-0000-000000000005', 'Driver''s License (DEMO)', 'DEMO-DL-0005', 'Demo City', '2021-01-15');
insert into public.pds_declaration_answers (employee_id, question_code, answer)
select 'e0000000-0000-0000-0000-000000000005', code, false from public.pds_declaration_questions;

-- Leave balances for the current year (DEMO values, not an entitlement rule)
insert into public.leave_balances (employee_id, leave_type_code, year, beginning, earned, used)
select e.id, t.code, extract(year from current_date)::int,
       case t.code when 'VL' then 5 else 6 end, 8.75 * extract(month from current_date) / 12.0 * 1.0,
       case when t.code = 'VL' and e.employee_no = 'DEMO-0005' then 1 else 0 end
from public.employees e cross join (values ('VL'), ('SL')) t(code)
where e.employee_no like 'DEMO-%';

-- Attendance for the last 30 days (weekdays). Deterministic pseudo-variation.
insert into public.attendance_records (employee_id, work_date, time_in, time_out, break_minutes, status_code, source, remarks)
select e.id, d::date,
       ((d::date + time '07:50') + ((abs(hashtext(e.id::text || d::text)) % 25) || ' minutes')::interval) at time zone 'Asia/Manila',
       case when d::date = current_date then null else (d::date + time '17:05') at time zone 'Asia/Manila' end,
       60,
       case when abs(hashtext(e.id::text || d::text)) % 25 > 10 then 'LATE' else 'PRESENT' end,
       'biometric', 'DEMO DATA'
from public.employees e
cross join generate_series(current_date - 30, current_date, interval '1 day') d
where e.employee_no like 'DEMO-%' and extract(isodow from d) < 6
  and e.employee_no not in ('DEMO-0009', 'DEMO-0010');

-- Juan: a missing time-out three working days ago (used by the acceptance walkthrough).
update public.attendance_records a
set time_out = null, status_code = 'MISSING_LOG', remarks = 'DEMO DATA: missing time out'
where a.employee_id = 'e0000000-0000-0000-0000-000000000005'
  and a.work_date = (select max(w::date) from generate_series(current_date - 6, current_date - 1, interval '1 day') w
                     where extract(isodow from w) < 6 and w::date <= current_date - 3);

-- Login accounts -> profiles and roles
insert into public.profiles (user_id, employee_id, display_name)
select u.id, e.id, v.display_name
from (values
  ('admin@demo.prc3.example',               null,         'System Administrator (DEMO)'),
  ('ricardo.villanueva@demo.prc3.example',  'DEMO-0001', 'Ricardo A. Villanueva'),
  ('teresita.navarro@demo.prc3.example',    'DEMO-0002', 'Teresita M. Navarro'),
  ('paolo.mercado@demo.prc3.example',       'DEMO-0003', 'Paolo D. Mercado'),
  ('lorna.dizon@demo.prc3.example',         'DEMO-0004', 'Lorna P. Dizon'),
  ('juan.delacruz@demo.prc3.example',       'DEMO-0005', 'Juan Dela Cruz'),
  ('analiza.bautista@demo.prc3.example',    'DEMO-0006', 'Ana Liza Bautista'),
  ('eduardo.pascual@demo.prc3.example',     'DEMO-0007', 'Eduardo S. Pascual')
) v(email, emp_no, display_name)
join auth.users u on u.email = v.email
left join public.employees e on e.employee_no = v.emp_no;

insert into public.user_roles (user_id, role_id)
select u.id, r.id
from (values
  ('admin@demo.prc3.example', 'SUPER_ADMIN'),
  ('ricardo.villanueva@demo.prc3.example', 'EXECUTIVE'), ('ricardo.villanueva@demo.prc3.example', 'SUPERVISOR'),
  ('ricardo.villanueva@demo.prc3.example', 'EMPLOYEE'),
  ('teresita.navarro@demo.prc3.example', 'HR_ADMIN'), ('teresita.navarro@demo.prc3.example', 'SUPERVISOR'),
  ('teresita.navarro@demo.prc3.example', 'EMPLOYEE'),
  ('paolo.mercado@demo.prc3.example', 'HR_STAFF'), ('paolo.mercado@demo.prc3.example', 'EMPLOYEE'),
  ('lorna.dizon@demo.prc3.example', 'SUPERVISOR'), ('lorna.dizon@demo.prc3.example', 'EMPLOYEE'),
  ('juan.delacruz@demo.prc3.example', 'EMPLOYEE'),
  ('analiza.bautista@demo.prc3.example', 'EMPLOYEE'),
  ('eduardo.pascual@demo.prc3.example', 'AUDITOR'), ('eduardo.pascual@demo.prc3.example', 'EMPLOYEE')
) v(email, role_code)
join auth.users u on u.email = v.email
join public.roles r on r.code = v.role_code;

commit;
