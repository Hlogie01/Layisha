#!/usr/bin/env bash
# Runs every migration plus the security tests on a throwaway local Postgres database.
# Needs psql and a local Postgres you can create databases on, e.g.:
#   PGHOST=localhost PGUSER=postgres supabase/tests/run-local.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

DB="layisha_test_$$"
psql -q -v ON_ERROR_STOP=1 -d postgres -c "create database $DB" >/dev/null
trap 'psql -q -d postgres -c "drop database if exists $DB" >/dev/null' EXIT

psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/local_stubs.sql >/dev/null
for f in supabase/migrations/*.sql; do
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" >/dev/null
done

if output=$(psql -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/security_test.sql 2>&1); then
  echo "$output" | grep -E "PASS|passed"
  exit 0
else
  echo "$output" | grep -E "PASS|FAIL|ERROR"
  exit 1
fi
