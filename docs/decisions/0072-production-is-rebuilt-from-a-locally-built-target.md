# 0072: Production is rebuilt from a locally built target, under a Time Travel bookmark

- Status: Accepted
- Date: 2026-09-14

## Context

Until 13 September 2026 only the identity load could reach production: `load.ts` wrote
`out/load.sql` and the runbook executed it against D1 by hand. Every other transform wrote
straight into a local SQLite target that nothing could ship. The pipeline had also grown to ten
scripts run in a documented order, with three catalogues to author and three reference maps to
confirm between them, and its dump loader took longer than the evening on the 44 MB proscenium
export. The reset of `unified` needed a path from "the whole estate, reconciled" to "the whole
estate, in D1", and one that could be run again after a partial failure.

## Decision

**One command builds the whole database locally, and one script replaces production's contents
with it.**

`migration/build.ts` creates `out/target.sqlite` by applying the application's own migrations in
journal order (`migration/schema.ts`, the same walk the test helper uses), writes the
`_hub_migrations` ledger, then runs every step in one process: inventory, identity (against the
recorded role decisions, 0070), load, catalogue (0075), bookings, training, programme,
reservations with reconstructed passes (0073), money. Each step reconciles before the next runs;
a failure stops the build with its exit code. The dumps are loaded statement by statement inside
one transaction (`execDump`), which is the difference between a second and never.

`migration/dump-data.ts` turns the built target into plain INSERT files under `out/publish/`,
parents before children, twenty thousand statements a file, with `PRAGMA defer_foreign_keys` at
the head of each. Rows the migrations themselves seed are left out, recognised by any unique key,
because on production they will already exist by the time the files run.

`migration/reset-production.sh` is the only script in the directory that writes to a remote
database. It refuses without `--i-mean-it <database>`, refuses without a Time Travel bookmark,
and then: drops every application table (never Nuxt Content's), runs `nuxt-db migrate` and
checks the ledger with `pending-migrations.sh`, executes the data files in order recording each
in `out/publish/DONE` so a rerun resumes, and compares every table's row count with the build's
`counts.json`. A mismatch is a non-zero exit with the bookmark printed again.

## Consequences

- `dry-run.sh` and the "pre-flight checklist" sequence in `docs/operations.md` are replaced; the
  transform-*.ts scripts remain as the same steps run alone.
- Nothing in `migration/` other than `reset-production.sh` and `copy-posters.ts` can write to a
  remote, and both say so in their first lines.
- The rebuild is of the whole database. It is right for a reset, and right for cutover if the
  parallel-run window ends with a frozen export; it is not a weekly upsert of a live database, and
  the runbook says which it is doing.
- Posters copy separately (`copy-posters.ts`) into the unified bucket and are linked by key; the
  build only needs the map file the copy writes, so the two run in either order.
