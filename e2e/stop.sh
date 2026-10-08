#!/usr/bin/env bash
# Stops the TEST-ONLY local stack. (Bracketed patterns stop pkill from matching this script itself.)
pkill -f "[n]ext-server" 2>/dev/null
pkill -f "[n]ext start" 2>/dev/null
pkill -f "e2e/[g]ateway.mjs" 2>/dev/null
pkill -x postgrest 2>/dev/null
BIN="$(ls -d /usr/lib/postgresql/*/bin | tail -1)"; AS=""; [ "$(id -u)" = 0 ] && AS="runuser -u postgres --"
$AS "$BIN/pg_ctl" -D "${PGTEST_DIR:-/var/tmp/ehris-pgtest}" -m immediate stop >/dev/null 2>&1
sleep 1
exit 0
