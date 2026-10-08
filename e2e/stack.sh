#!/usr/bin/env bash
# Starts the TEST-ONLY local stack: PostgreSQL (migrations + demo data) → PostgREST → gateway → Next.js.
# Requires: psql/postgres 16 binaries, a PostgREST binary (POSTGREST_BIN), and `npm run build` done.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
POSTGREST_BIN="${POSTGREST_BIN:-/tmp/claude-0/pgrst/bin/postgrest}"
LOG="${E2E_LOG_DIR:-/tmp/e2e-logs}"; mkdir -p "$LOG"
export JWT_SECRET="${JWT_SECRET:-e2e-only-secret-e2e-only-secret-0123456789}"
export E2E_PASSWORD="${E2E_PASSWORD:-E2e-Demo-Password-2026}"
export PGRST_URL="http://127.0.0.1:54322"
export PG_CONN="postgresql://postgres@localhost:54329/ehris_test?host=/tmp"

bash "$ROOT/supabase/tests/run.sh" --keep >"$LOG/db.log" 2>&1 || { tail -20 "$LOG/db.log"; exit 1; }
psql "$PG_CONN" -q -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname='authenticator') then create role authenticator noinherit login; end if; end \$\$; grant anon, authenticated to authenticator; grant usage on schema auth to authenticator;"

cat >"$LOG/pgrst.conf" <<CONF
db-uri = "postgresql:///ehris_test?host=/tmp&port=54329&user=authenticator"
db-schemas = "public"
db-anon-role = "anon"
db-extra-search-path = "public, extensions"
jwt-secret = "$JWT_SECRET"
server-host = "127.0.0.1"
server-port = 54322
CONF
nohup "$POSTGREST_BIN" "$LOG/pgrst.conf" >"$LOG/pgrst.log" 2>&1 &
echo $! >"$LOG/pgrst.pid"
nohup node "$ROOT/e2e/gateway.mjs" >"$LOG/gateway.log" 2>&1 &
echo $! >"$LOG/gateway.pid"

b64() { printf '%s' "$1" | basenc --base64url -w0 | tr -d '='; }
now=$(date +%s)
mk() { local h p; h=$(b64 '{"alg":"HS256","typ":"JWT"}'); p=$(b64 "{\"role\":\"$1\",\"iss\":\"e2e\",\"iat\":$now,\"exp\":$((now+86400))}"); echo "$h.$p.$(printf '%s' "$h.$p" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | basenc --base64url -w0 | tr -d '=')"; }
export SUPABASE_URL="http://127.0.0.1:54321"
export SUPABASE_ANON_KEY="$(mk anon)"
export APP_URL="http://127.0.0.1:3100"
export DEMO_MODE=true
export SESSION_IDLE_MINUTES=30
printf 'export SUPABASE_URL=%s SUPABASE_ANON_KEY=%s E2E_PASSWORD=%s\n' "$SUPABASE_URL" "$SUPABASE_ANON_KEY" "$E2E_PASSWORD" >"$LOG/env"
cd "$ROOT"
nohup npx next start -p 3100 -H 127.0.0.1 >"$LOG/next.log" 2>&1 &
echo $! >"$LOG/next.pid"
for i in $(seq 1 60); do curl -fsS -o /dev/null http://127.0.0.1:3100/login && break; sleep 1; done
curl -fsS -o /dev/null http://127.0.0.1:3100/login && echo "stack ready on http://127.0.0.1:3100"
