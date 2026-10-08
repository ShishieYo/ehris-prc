#!/usr/bin/env bash
# Builds the app, starts the TEST-ONLY local stack, runs every browser suite, stops the stack.
# Usage: POSTGREST_BIN=/path/to/postgrest bash e2e/run-all.sh
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
LOG="${E2E_LOG_DIR:-/tmp/e2e-logs}"
bash e2e/stop.sh
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=build-only-placeholder-key APP_URL=http://127.0.0.1:3100 npx next build >"$LOG.build.log" 2>&1 || { tail -20 "$LOG.build.log"; exit 1; }
bash e2e/stack.sh || exit 1
source "$LOG/env"
rc=0
for suite in acceptance tour flows resilience; do
  echo; echo "################ $suite"
  node "e2e/$suite.mjs" || rc=1
done
bash e2e/stop.sh
[ $rc = 0 ] && echo -e "\nALL E2E SUITES PASSED" || echo -e "\nE2E FAILURES"
exit $rc
