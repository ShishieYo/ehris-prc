// Creates the fictional DEMO login accounts in Supabase Auth (idempotent).
// Usage: node --env-file=.env.local scripts/create-demo-users.mjs
// Refuses to run unless DEMO_MODE=true, so it can't be pointed at a real deployment by accident.
import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_MODE, DEMO_PASSWORD } = process.env;
if (DEMO_MODE !== "true") {
  console.error("DEMO_MODE must be 'true'. Demo accounts must never be created in a production environment.");
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}
if (!DEMO_PASSWORD || DEMO_PASSWORD.length < 12) {
  console.error("Set DEMO_PASSWORD (at least 12 characters) in your environment.");
  process.exit(1);
}

const EMAILS = [
  "admin@demo.prc3.example",
  "ricardo.villanueva@demo.prc3.example",
  "teresita.navarro@demo.prc3.example",
  "paolo.mercado@demo.prc3.example",
  "lorna.dizon@demo.prc3.example",
  "juan.delacruz@demo.prc3.example",
  "analiza.bautista@demo.prc3.example",
  "eduardo.pascual@demo.prc3.example",
];

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: existing, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listError) throw listError;

for (const email of EMAILS) {
  const found = existing.users.find((u) => u.email === email);
  if (found) {
    const { error } = await admin.auth.admin.updateUserById(found.id, { password: DEMO_PASSWORD, email_confirm: true });
    if (error) throw error;
    console.log(`updated  ${email}`);
  } else {
    const { error } = await admin.auth.admin.createUser({ email, password: DEMO_PASSWORD, email_confirm: true });
    if (error) throw error;
    console.log(`created  ${email}`);
  }
}
console.log("\nNext: load the demo records →  psql \"$DATABASE_URL\" -f supabase/demo/demo_data.sql");
