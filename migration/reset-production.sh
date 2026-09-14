#!/usr/bin/env bash
# The only script in this directory that writes to production (0072): drops every application
# table in the named D1 database, re-applies the migrations, loads out/publish/*.sql, and compares
# row counts with the build. Refuses without `--i-mean-it <database>` and without a Time Travel
# bookmark to fall back on. Rerunnable: files already loaded are recorded in out/publish/DONE.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "${1:-}" != "--i-mean-it" ] || [ -z "${2:-}" ]; then
  echo "usage: migration/reset-production.sh --i-mean-it <d1-database-name>" >&2
  echo "This destroys every row in that database. Build and inspect out/target.sqlite first." >&2
  exit 1
fi
DB="$2"
PUBLISH=migration/out/publish
DONE="$PUBLISH/DONE"
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-3d250a94794003bd921b7f0379de7f00}"

# The migrations apply through nuxt-db when the NUXT_HUB_* triplet is set, and otherwise through
# wrangler's own applier against the built config, which records the same _hub_migrations table.
WRANGLER_CONFIG=.output/server/wrangler.json
if [ -z "${NUXT_HUB_CLOUDFLARE_API_TOKEN:-}" ] && [ ! -f "$WRANGLER_CONFIG" ]; then
  echo "No NUXT_HUB_* triplet and no $WRANGLER_CONFIG: run bun run build first." >&2
  exit 1
fi

WRANGLER=./node_modules/.bin/wrangler
[ -x "$WRANGLER" ] || WRANGLER="bunx wrangler"

if [ ! -f "$PUBLISH/counts.json" ]; then
  echo "No $PUBLISH/counts.json: run bun migration/build.ts, then bun migration/dump-data.ts." >&2
  exit 1
fi

echo "== Time Travel bookmark for $DB (keep this line)"
BOOKMARK=$($WRANGLER d1 time-travel info "$DB" --json 2>/dev/null | grep -oE '"bookmark": *"[^"]+"' | head -1 | sed 's/.*: *"//; s/"$//') || true
if [ -z "$BOOKMARK" ]; then
  echo "Could not read a Time Travel bookmark; refusing to continue." >&2
  exit 1
fi
echo "restore with: $WRANGLER d1 time-travel restore $DB --bookmark=$BOOKMARK"
echo "$BOOKMARK" > "$PUBLISH/BOOKMARK"

if [ ! -f "$DONE" ]; then
  echo "== Dropping every application table in $DB"
  # dump-data.ts wrote 000-drop.sql children first from the build's own schema; anything the
  # remote holds beyond that (an older table) is dropped after it; D1's own _cf tables are never touched.
  RAW=$($WRANGLER d1 execute "$DB" --remote --json --command "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_content%' ESCAPE '\\'")
  printf '%s' "$RAW" | grep -oE '"name": *"[^"]+"' | sed 's/.*: *"//; s/"$//' | sort > "$PUBLISH/tables-before.txt"
  cp "$PUBLISH/000-drop.sql" "$PUBLISH/000-drop-remote.sql"
  while read -r table; do
    case "$table" in _cf*) continue ;; esac
    grep -q "\"$table\"" "$PUBLISH/000-drop.sql" || echo "DROP TABLE IF EXISTS \"$table\";" >> "$PUBLISH/000-drop-remote.sql"
  done < "$PUBLISH/tables-before.txt"
  $WRANGLER d1 execute "$DB" --remote --yes --file "$PUBLISH/000-drop-remote.sql"

  if [ -n "${NUXT_HUB_CLOUDFLARE_API_TOKEN:-}" ]; then
    echo "== Applying the migrations with nuxt-db"
    NODE_ENV=production ./node_modules/.bin/nuxt-db migrate --verbose
  else
    echo "== Applying the migrations with wrangler"
    # wrangler resolves migrations_dir against the config file's own folder, so a copy of the
    # built config lives beside the publish files pointing back at the real directory.
    bun -e "const w = require('./$WRANGLER_CONFIG'); w.d1_databases = w.d1_databases.map(d => ({ ...d, migrations_dir: '../../../server/db/migrations/sqlite' })); require('fs').writeFileSync('$PUBLISH/wrangler.json', JSON.stringify({ name: w.name, compatibility_date: w.compatibility_date, d1_databases: w.d1_databases }, null, 2))"
    $WRANGLER d1 migrations apply "$DB" --remote -c "$PUBLISH/wrangler.json"
  fi
  PENDING=$(D1_DATABASE_NAME="$DB" ./.github/scripts/pending-migrations.sh)
  if [ -n "$PENDING" ]; then
    echo "Migrations still pending after applying:" >&2
    echo "$PENDING" >&2
    exit 1
  fi
  : > "$DONE"
fi

echo "== Loading data files"
for file in "$PUBLISH"/[0-9][0-9][0-9]-data.sql; do
  name=$(basename "$file")
  if grep -qx "$name" "$DONE"; then
    echo "   $name already loaded"
    continue
  fi
  echo "   $name"
  $WRANGLER d1 execute "$DB" --remote --yes --file "$file"
  echo "$name" >> "$DONE"
done

echo "== Comparing row counts"
FAILED=0
while IFS= read -r line; do
  table=$(printf '%s' "$line" | sed -E 's/^ *"([^"]+)": *([0-9]+),?$/\1/')
  expected=$(printf '%s' "$line" | sed -E 's/^ *"([^"]+)": *([0-9]+),?$/\2/')
  [ -n "$table" ] && [ "$table" != "$line" ] || continue
  case "$table" in _hub_migrations) continue ;; esac
  actual=$($WRANGLER d1 execute "$DB" --remote --json --command "SELECT count(*) AS n FROM \"$table\"" 2>/dev/null | grep -oE '"n": *[0-9]+' | head -1 | sed 's/.*: *//') || actual="?"
  if [ "$actual" != "$expected" ]; then
    echo "   MISMATCH $table: built $expected, production $actual"
    FAILED=1
  fi
done < "$PUBLISH/counts.json"

if [ "$FAILED" -ne 0 ]; then
  echo "Row counts differ from the build. Bookmark: $BOOKMARK" >&2
  exit 1
fi
echo "Production matches the build. Bookmark kept in $PUBLISH/BOOKMARK."
