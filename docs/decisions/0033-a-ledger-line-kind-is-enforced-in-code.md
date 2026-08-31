# 0033: A ledger line's kind is enforced in code, its source and tender by the database

- Status: Accepted
- Date: 2026-08-31

## Context

The ledger is append-only and trigger-enforced (0004, 0010), and CI refuses a migration that
rebuilds an append-only table. SQLite cannot alter a constraint in place: widening a CHECK is a
full table rebuild. So every CHECK on `ledger_entries` and `ledger_lines` is decided once, at
creation, and is thereafter as permanent as the rows themselves.

`docs/data-model.md` specified three CHECK enums: `source`, `tender` and `ledger_lines.kind`. The
first two are closed sets about how money moved, and have been stable since the old estate. The
third is a list of the things this theatre sells, and it is being frozen now, before the modules
that sell them exist. Adding `MEMBERSHIP` after module D ships would cost a decision record, a
hand-written migration and a maintenance window, for a value that breaks nothing.

An `ALTER TABLE ADD COLUMN` does not rebuild, so columns can still be added later. Only
constraints are permanent. That asymmetry is what this record is about.

## Decision

**`source` and `tender` keep their CHECK constraints.** `DESK|TILL|SELF_SERVE|IMPORT|SYSTEM` and
`CARD|COMP|TAB|NONE` describe how money moved rather than what was sold, and a value outside them
would be a mistake rather than a new product.

**`ledger_lines.kind` is enforced at the write path instead**, by a Zod enum in
`shared/utils/ledger.ts`, and the column carries no CHECK. `server/utils/ledger.ts` is the only
writer, `check:ledger` refuses any other file that inserts into a ledger table, and a kind absent
from the enum is a failed request rather than a failed constraint.

**`comp_reason` likewise carries no CHECK.** The data model names one, but no record anywhere
states its values: comps belong to module D, which does not exist. A constraint cannot be written
from an enum nobody has decided, and writing one now would freeze a guess. It is validated at the
write path when comps are built.

This supersedes the `kind` and `comp_reason` CHECKs named in `docs/data-model.md`'s ledger section.
The `source` and `tender` CHECKs stand as written.

## Consequences

- A module that sells something new adds one value to an enum and a case to a test. It does not
  touch the schema, and nothing is applied by hand.
- The guarantee moves from the database to one file, which is weaker. It is worth stating plainly:
  a direct `INSERT` at a SQL prompt could write a kind nothing recognises. `check:ledger` is what
  makes that a build failure rather than a discovery, and it is the reason the checker is part of
  this slice rather than a later tidy-up.
- Reports group by kind, so an unrecognised one would fall out of a total silently. Every reader
  of `kind` handles the unknown case the way `describeAction` does for an audit action nobody
  registered (0027).
