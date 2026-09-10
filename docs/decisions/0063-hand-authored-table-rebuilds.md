# 0063: How this repository rebuilds a table that `check:migrations` refuses

- Status: Accepted
- Date: 2026-09-10

## Context

`check:migrations`' rebuild checks (0010, 0052) refuse every table rebuild they see, and the
grandfather list they refuse against is empty: this schema started clean, so any rebuild here is
a defect by default. Until now that was true without exception. Two stories in one day needed
the exception anyway: E-128 re-keys `checklist_stamps` and `checklist_closes` from `venue_id`
and `night` to `performance_id`, and E-125 needs `night_reports.signed_by` nullable and
`signed_via` to gain a third value, `SYSTEM`, neither expressible as an `ALTER COLUMN`, which
SQLite does not have. Both are constraint changes on live column sets, not additive schema
growth, so both are rebuilds.

Nothing here previously said what a deliberate, correct rebuild looks like, only what the checker
refuses and why. The first story to actually need one found that out by trial, against SQLite's
own errors, rather than against a written procedure. That is worth fixing before a third story
needs the same answer.

**Append-only status is not what governs this.** `checklist_stamps` and `checklist_closes` carry
no triggers; they are mutable configuration state, the same shape `shift_templates` is, not the
ledger, the incident log or the age-check register 0010 was written for. The instinct to reach
for 0010 as the reason a rebuild here needs care is understandable and wrong: 0010 governs a
narrow, named set of tables by their trigger enforcement, and neither of these two is in it.
What actually refuses an undisciplined rebuild of *any* table, append-only or not, is
`check:migrations` itself, mechanically, for three independent reasons that have nothing to do
with whether the table happens to be a register.

## Decision

A rebuild `check:migrations` would otherwise refuse is hand-authored, never generated and
accepted, following this procedure:

1. **Write the new `CREATE TABLE __new_x` by hand**, copying every column, foreign key and check
   constraint from the current migration for `x`, edited for the actual change. Every check
   constraint's table-qualified references must name `__new_x`, not `x`: SQLite resolves a
   qualified reference in a `CHECK` constraint against the table being created, and a constraint
   still reading `"x"."column"` fails outright with "no such column", not silently. `ALTER TABLE
   __new_x RENAME TO x` afterwards rewrites every such reference back to `x` automatically, so the
   table's own stored schema is correct once the rebuild finishes.
2. **Write the copying `INSERT INTO __new_x (...) SELECT ... FROM x` by hand**, naming every
   target column and never using a bare double-quoted placeholder for one the source table does
   not have (0052): a column the rebuild adds needs a real expression, not a guess.
   `check:migrations` parses this statement with a regular expression, not a SQL parser, and its
   pattern stops at the first literal `FROM` after `SELECT`. A resolving subquery inside the
   `SELECT` list (needed when a new column's value depends on a lookup elsewhere) must be moved
   into a joined derived table instead, so the `SELECT` list itself carries no `FROM`, or the
   checker misreads the statement's source table and selected columns.
3. **`PRAGMA foreign_keys=OFF` is a no-op inside a transaction**, and D1 runs every migration
   inside one, so the rebuild's own `DROP TABLE x` runs with foreign keys enforced regardless of
   the pragma. A table `x` that any other table references with `cascade` or `set null` loses
   rows or a reference silently the moment the drop runs; one referenced with `restrict` or the
   SQLite default `no action` aborts the whole migration outright the first time a referencing
   row exists, which an empty development database never has and production eventually will.
   `check:migrations` refuses this case unconditionally rather than trying to judge it safe:
   a table with a `restrict` or `no action` dependent is rebuilt only alongside every dependent
   that references it, in an order where nothing referencing `x` still exists in its old shape
   when `x` itself is dropped. This is why E-125's rebuild of `night_reports` needs
   `night_report_addenda` and `night_report_deliveries` rebuilt with it and E-128's does not:
   nothing references `checklist_stamps` or `checklist_closes`.
4. **Any hand-authored trigger on the table is dropped by `DROP TABLE x`** and is not in the
   Drizzle snapshot, so nothing regenerates it. It is re-created in the same migration, after the
   rename, or the table stops being append-only the moment the migration runs, silently, since
   0010's own trigger-drop check is the only thing that would notice and it is a table `x`
   genuinely append-only, unlike `checklist_stamps` and `checklist_closes`, will actually need.
5. **A hand-authored migration needs no paired `meta/x_snapshot.json` for `check:migrations` to
   accept it**: a snapshot missing from the journal is a recognised shape, not a gap. It still
   needs a real one for Drizzle's own future diffing to stay correct, generated with
   `drizzle-kit generate --custom`, which reserves the journal entry and an empty `.sql` file
   without prompting or diffing, followed by hand-editing that snapshot's JSON to the table's
   true post-migration shape before the hand-authored SQL is written into the reserved file.
   Skipping this step leaves the next real `drizzle-kit generate` diffing against a stale shape
   and proposing to redo, badly, what this migration already did by hand.
6. **Existing rows are carried forward, not dropped.** Where the new key is unambiguous from the
   data alone, the copying `INSERT` resolves it directly. Where it is not, the migration's own
   comment states which row the resolution chose and why, because that comment is the only record
   a successor has of the judgement made; nothing else remembers it.

## Consequences

- `check:migrations`' refusal is unconditional and stays that way: this record does not add a
  grandfather entry or a bypass flag. A hand-authored rebuild still passes every check that
  applies to a generated one, because the checks are about correctness (an unresolved copying
  column, a dropped trigger, a broken dependent), not about authorship.
- Steps 1 to 5 apply to any table's rebuild, append-only or not. Step 6's judgement is specific to
  the data actually being moved and belongs in the migration that makes it, not repeated here.
- E-128's migration and E-125's, once written, are this record's first two worked examples; both
  cite it rather than re-deriving the procedure.
