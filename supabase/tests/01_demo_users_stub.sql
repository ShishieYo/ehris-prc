-- Test-only stand-ins for the Supabase Auth accounts that npm run demo:users creates.
insert into auth.users (id, email) values
  (gen_random_uuid(), 'admin@demo.prc3.example'),
  (gen_random_uuid(), 'ricardo.villanueva@demo.prc3.example'),
  (gen_random_uuid(), 'teresita.navarro@demo.prc3.example'),
  (gen_random_uuid(), 'paolo.mercado@demo.prc3.example'),
  (gen_random_uuid(), 'lorna.dizon@demo.prc3.example'),
  (gen_random_uuid(), 'juan.delacruz@demo.prc3.example'),
  (gen_random_uuid(), 'analiza.bautista@demo.prc3.example'),
  (gen_random_uuid(), 'eduardo.pascual@demo.prc3.example');
