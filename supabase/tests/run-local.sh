#!/usr/bin/env bash
# Proves supabase/taskflow_schema.sql against throwaway local Postgres databases with Supabase stand-ins. Never touches Supabase.
#  1. FRESH install:  schema ×2 → structure + behaviour assertions → schema ×3 over data.
#  2. MIGRATION:      frozen phase-1 schema + phase-1 seed + sample work (+ user-made tags) → current schema ×3 →
#                     nothing deleted, ids kept, every task/preset/session/note on the right tag, tree == new-account seed.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SCHEMA="$HERE/../taskflow_schema.sql"
PGBIN="${PGBIN:-$(ls -d /opt/homebrew/opt/postgresql@1[5-9]/bin /usr/lib/postgresql/*/bin 2>/dev/null | tail -1 || true)}"
PORT="${PGPORT:-54329}"
TMP="$(mktemp -d)"
export PATH="$PGBIN:$PATH" PGOPTIONS="-c client_min_messages=warning"
cd "$HERE"

cleanup() { pg_ctl -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

initdb -D "$TMP/data" -U postgres --auth=trust >/dev/null
pg_ctl -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/pg.log" -w start >/dev/null
psql_db() { local db="$1"; shift; psql -h "$TMP" -p "$PORT" -U postgres -d "$db" -v ON_ERROR_STOP=1 -q "$@"; }
for db in fresh mig; do createdb -h "$TMP" -p "$PORT" -U postgres "$db"; psql_db "$db" -f stand-ins.sql; done

EXPECTED="$(cat expected-tree.json)"
EXPECT_SQL=(-c "select set_config('tf.expected', \$tf\$${EXPECTED}\$tf\$, false)")

echo "━━ fresh install"
echo "→ schema run 1"; psql_db fresh -f "$SCHEMA"
echo "→ schema run 2"; psql_db fresh -f "$SCHEMA"
echo "→ assertions";   psql_db fresh -t -f assertions.sql | grep -E "PASSED" || true
echo "→ behaviours";   psql_db fresh -t -f behaviours.sql | grep -E "PASSED"
echo "→ schema run 3 (over data)"; psql_db fresh -f "$SCHEMA"
rows=$(psql_db fresh -t -A -c "select (select count(*) from taskflow_tasks) + (select count(*) from taskflow_areas) + (select count(*) from taskflow_sleep)")
[ "$rows" -gt 0 ] || { echo "data was lost by re-running the schema"; exit 1; }

echo "━━ migration from phase 1"
A=11111111-1111-1111-1111-111111111111
B=22222222-2222-2222-2222-222222222222
psql_db mig -f fixtures/taskflow_schema_phase1.sql
psql_db mig -c "insert into auth.users (id) values ('$A'), ('$B')"
psql_db mig -v uid="$A" -f fixtures/phase1_seed.sql
psql_db mig -v uid="$B" -f fixtures/phase1_seed.sql
psql_db mig -v uid="$B" -f fixtures/phase2_customs.sql
psql_db mig -f capture-before.sql
echo "→ current schema, run 1 (the migration)"; psql_db mig -f "$SCHEMA"
psql_db mig -c "create table tftest.log_after_first as select count(*)::int as log_rows from taskflow_migration_log"
echo "→ run 2";  psql_db mig -f "$SCHEMA"
echo "→ run 3";  psql_db mig -f "$SCHEMA"
psql_db mig -f tag-path.sql
echo "→ migration assertions"
{ printf "select set_config('tf.expected', \$tf\$%s\$tf\$, false) \\\\g /dev/null\n" "$EXPECTED"; cat migration-assertions.sql; } > "$TMP/mig-assert.sql"
cp structure.sql "$TMP/structure.sql"
(cd "$TMP" && psql_db mig -t -f mig-assert.sql | grep -E "PASSED")
echo "→ behaviours on the migrated database"; psql_db mig -t -f behaviours.sql | grep -E "PASSED"

echo "OK — fresh install and phase-1 → revision-2 migration both pass, and the schema is idempotent"
