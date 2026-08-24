# ADR-0037: A generated table rebuild takes its dependents with it

**Status:** Accepted · **Date:** 2026-08-24 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

SQLite cannot change most column constraints in place, so Drizzle implements them as a **table
rebuild**: create `__new_t`, copy the rows across, `DROP TABLE t`, rename. It brackets the whole
thing in `PRAGMA foreign_keys=OFF` … `PRAGMA foreign_keys=ON`, because the `DROP` would otherwise
fire every foreign key pointing at the table.

**`PRAGMA foreign_keys` is a no-op inside a transaction.** That is documented SQLite behaviour, and
D1 applies a migration's statements inside one, so the pragma never takes effect and the cascade is
live throughout. `DROP TABLE t` then deletes every row in every table that references it with
`ON DELETE cascade`, and reports success.

This is not theoretical. Migration `0047`, part of [ADR-0035](./0035-stock-is-counted-in-real-units.md),
rebuilt `bar_products` to make one column nullable. Production had four `bar_prices` rows. After the
migration it had none: the products survived, the prices cascaded away, and nothing in the migration
job, the build or the health check noticed. The bar had not opened, so the only symptom would have
been a till with an empty menu, because `GET /api/bar/tonight` drops anything with no current price.

It was found by hand, four days later, while reading the catalogue for something else. ADR-0035
already records a *different* way the same rebuild misbehaves under D1 (its copying `INSERT` reads
new column names from the old table, and SQLite turns the missing ones into string literals rather
than erroring). Two silent failures from one mechanism is enough to make a rule of it.

## Decision

**A generated migration may not rebuild a table that anything cascades onto**, and CI checks it.
`scripts/check-migrations.mjs` reads the newest Drizzle snapshot for every `ON DELETE cascade`
relationship, scans each migration for Drizzle's `CREATE TABLE \`__new_…\`` marker, and fails naming
the table, the dependents and what would be lost.

When a change needs a rebuild, there are two ways through, in order of preference:

1. **Split it so no rebuild is needed.** Additions, renames and constraint changes generate
   separately, and adds and renames are plain `ALTER TABLE`. ADR-0036's migration is three files
   for exactly this reason and rebuilds nothing.
2. **Hand-author it**, saving the dependent rows into a temporary table and restoring them after
   the rename, the way `0034` and `0041` are hand-authored for triggers.

Two migrations predate the rule and are named in the script rather than silently skipped: `0047`,
which caused the loss, and `0040`, which rebuilt `bar_sessions` over an empty
`bar_session_performances` and got away with it.

## Alternatives considered

**Trust review.** The rule is easy to state, and the generated SQL is already hand-reviewed. Rejected
because it was reviewed, by someone who had just written a note warning about a *different* fault in
the same generated SQL, and the cascade still went unnoticed. A guarantee that depends on the reader
holding two traps in mind is not one.

**Drop the cascades and delete dependents in application code.** Would make rebuilds safe. Rejected:
the cascades are correct, they are what makes deleting a product delete its prices, and trading a
real integrity constraint for a migration convenience is the wrong way round.

**Take a Time Travel restore point and diff the row counts afterwards.** The migrate workflow
already takes the restore point. Rejected as the wrong half of the problem: it tells you afterwards,
against a database you have already deployed code for, and the counts it would compare are not
recorded anywhere.

## Consequences

- `bun run check:migrations` joins the CI gate. It costs nothing to run and needs no database.
- The four lost `bar_prices` rows were not recovered. The catalogue they belonged to was being
  replaced the same day, so the practical loss was nil, but the values are gone: D1 Time Travel
  restores a whole database rather than reading one table out of the past, and rewinding a database
  that had since been re-seeded would have cost more than it recovered.
- **Verifying a migration means seeding the dependent tables too.** ADR-0035's verification applied
  the chain to a database holding products, movements, deliveries and stocktake lines, and it caught
  a real fault. It held no `bar_prices` rows, so it could not have caught this one. A rehearsal is
  only as good as the rows it starts with.
