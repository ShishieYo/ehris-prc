#!/usr/bin/env bash
# Spins up a throwaway PostgreSQL 16, applies the migrations and demo data, and
# runs every tests/*.test.sql file. Usage: supabase/tests/run.sh [--keep]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BIN="$(ls -d /usr/lib/postgresql/*/bin | tail -1)"
DATA="${PGTEST_DIR:-/var/tmp/ehris-pgtest}"
PORT="${PGTEST_PORT:-54329}"
AS=""
if [ "$(id -u)" = 0 ]; then AS="runuser -u postgres --"; fi

cleanup() { [ "${1:-}" = "--keep" ] || $AS "$BIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; }
trap 'cleanup "${1:-}"' EXIT

$AS "$BIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true
rm -rf "$DATA"; mkdir -p "$DATA"; [ "$(id -u)" = 0 ] && chown postgres "$DATA"
$AS "$BIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
$AS "$BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp -c listen_addresses=''" -l "$DATA/log" -w start >/dev/null
PSQL="psql -h /tmp -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL -d postgres -c "create database ehris_test" >/dev/null
P="$PSQL -d ehris_test"

echo "== stub"; $P -f "$ROOT/supabase/tests/00_supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do echo "== $(basename "$f")"; $P -f "$f"; done
echo "== demo data"; $P -f "$ROOT/supabase/tests/01_demo_users_stub.sql"; $P -f "$ROOT/supabase/demo/demo_data.sql"; $P -f "$ROOT/supabase/tests/02_helpers.sql"
rc=0
cd "$ROOT"
for f in "$ROOT"/supabase/tests/*.test.sql; do
  echo "== $(basename "$f")"
  status=0
  out=$($P -o /dev/null -f "$f" 2>&1 | sed -E "s/^psql:[^ ]+ NOTICE:  //") || status=$?
  echo "$out" | grep -v '^$' || true
  [ $status = 0 ] || rc=1
done
[ $rc = 0 ] && echo "ALL DB TESTS PASSED" || { echo "DB TESTS FAILED"; exit 1; }
