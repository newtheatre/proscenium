#!/usr/bin/env bash
#
# Print the migration tags that exist on disk but are absent from production's
# `_hub_migrations` ledger: one per line, nothing at all when up to date.
#
# `nuxt db migrate` has no dry-run, so this stands in for one. It is also the
# gate the migrate workflow runs *after* applying, because the CLI cannot be
# trusted to fail loudly on its own: `nuxt db migrate` exits 0 even when the
# migration errored (the `nuxt db` proxy swallows the code: `nuxt-db migrate`
# is the invocation that propagates it, and the workflow uses that). Checking
# the ledger afterwards is the only version-independent proof that the work
# actually landed.
#
# Both ledger spellings are folded together: `nuxt db migrate` records
# `0016_lying_maverick` and `wrangler d1 migrations apply` records
# `0016_lying_maverick.sql`, and production carries both for every migration so
# far. See docs/08-operations.md §5.
#
# Exit codes: 0 = ledger read (output may be empty), 2 = could not read it.
set -euo pipefail

DB_NAME="${D1_DATABASE_NAME:-proscenium}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-server/db/migrations/sqlite}"

# Prefer the installed wrangler: `bunx wrangler` fetches on a version bump,
# and the install chatter lands on stdout and corrupts the parse below.
if [ -x ./node_modules/.bin/wrangler ]; then
  WRANGLER=./node_modules/.bin/wrangler
else
  WRANGLER="bunx wrangler@4"
fi

# Slice from the first `[` so any banner ahead of the JSON is discarded rather
# than grepped for `"name"`.
raw=$($WRANGLER d1 execute "$DB_NAME" --remote --json \
  --command "SELECT name FROM _hub_migrations" 2>/dev/null) || true
json=${raw#*[}
applied=$(printf '%s' "[$json" \
  | grep -oE '"name": *"[^"]+"' \
  | sed 's/.*: *"//; s/"$//; s/\.sql$//' \
  | sort -u) || true

if [ -z "$applied" ]; then
  echo "Could not read _hub_migrations from '$DB_NAME'." >&2
  exit 2
fi

for file in "$MIGRATIONS_DIR"/[0-9]*.sql; do
  [ -e "$file" ] || continue
  tag=$(basename "$file" .sql)
  grep -qx "$tag" <<<"$applied" || echo "$tag"
done
