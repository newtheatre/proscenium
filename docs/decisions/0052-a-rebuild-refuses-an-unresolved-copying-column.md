# 0052: A table rebuild refuses a copying column that does not resolve

- Status: Accepted
- Date: 2026-09-09

## Context

A generated table rebuild copies every row from the old table into the new one with
`INSERT INTO __new_x (...) SELECT ... FROM x`. When the rebuild adds a column, drizzle-kit
still names that new column in the SELECT list, as a bare double-quoted identifier, even though
the old table has no such column. SQLite's own fallback for an unresolvable double-quoted token
is to read it as a string literal rather than to error. Nothing fails: every copied row silently
receives the column's own name as its value instead of a real one.

Two independent occurrences confirmed this is systematic rather than a one-off. Box office's
#757 rebuilt `ticket_types` and emitted `SELECT ... "restricted_to" ... FROM ticket_types`; caught
only by reading the generated SQL, and the migration was reworked to avoid the rebuild entirely.
Show night's #760 rebuilt `venue_emergency_info`, whose old primary key was `venue_id` with no
`id` column, and emitted `SELECT "id", "venue_id", ... FROM venue_emergency_info`; hand-corrected
to `SELECT lower(hex(randomblob(16))), "venue_id", ... FROM venue_emergency_info`. Both migrations
would apply cleanly against an empty development database, corrupting nothing there is to corrupt,
and only fail a human reading closely enough to notice a column being copied from a table that
never had it.

## Decision

A rebuild's generated SQL is read, never trusted, the same discipline 0010 already applies to a
dropped dependent or a dropped trigger. `check:migrations` now enforces the specific case
mechanically: it parses every rebuild's copying `INSERT ... SELECT`, resolves the source table
against the schema snapshot as it stood immediately before that migration, and refuses the
migration if any double-quoted item in the SELECT list does not name a real column on that
source table. A backtick, bracket or bare identifier is not checked, because SQLite has no
string-literal fallback for those: an unresolvable one fails the migration outright, which the
existing scratch-database migration tests already catch. Only the double-quoted form is silent,
and only the silent form needs a static check.

## Consequences

- The checker's failure message states the mechanism plainly: SQLite cannot resolve the
  identifier as a column, so it reads it as a string literal, and every copied row gets that
  literal text instead of a value. The shape is unintuitive enough that the message has to carry
  it, not just name the column.
- The fix at the call site is the same one 0010 already asks for: replace the unresolvable
  identifier with a real expression, such as a generated id or a sensible default, before the
  migration is safe to merge.
- `tests/unit/migrations.test.ts` pins the #760 case directly, before its hand correction, so the
  rule is proved against a real migration rather than only an abstract fixture.
