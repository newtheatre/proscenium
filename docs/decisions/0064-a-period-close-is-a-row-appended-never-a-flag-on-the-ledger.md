# 0064: A period close is a row appended, never a flag on the ledger

- Status: Accepted
- Date: 2026-09-10

## Context

I-107 asks for the treasurer to close a period (a term or a season) so reported figures stop
moving, with corrections posting into the open period instead. The ledger is append-only and
trigger-enforced (0010): `ledger_entries` accepts no `UPDATE`, and a migration that rebuilds it
is refused. So closing cannot be a column on the entries a period covers, the way an obvious
first design (`ledger_entries.locked BOOLEAN`) would want to make it: that column could never be
added without a rebuild, and even if it could, flipping it on every row in a period is exactly
the "IN list scaling with rows" shape 0001 and 0003 forbid.

The six modules that take money (`refunds.ts`, `tab-settlement.ts`, `pass-issue.ts`,
`pass-redemption.ts`, `desk-collection.ts`, `sale.ts`) all reach `ledger_entries` through exactly
one function, `postEntry()` in `server/utils/ledger.ts`, which `check:ledger` already refuses any
other file the right to call directly. A lock that only some of those six remembered to check
would repeat the exact failure shape 0058 named for `performanceId`: two writers silently dropped
the column for weeks, and nothing caught it until a report read the gap.

## Decision

**The lock is a new table, `period_locks`, appended to and never edited.** A row names a range
(`from_day`, `to_day`, both `london_day` format, inclusive) and an action, `CLOSED` or
`REOPENED`. Whether a given day is currently locked is read off the *latest* row (by
`created_at`) whose range covers it: `CLOSED` locks it, `REOPENED` or no row at all leaves it
open. Reopening inserts a new `REOPENED` row for the same range rather than mutating the
`CLOSED` row it reopens, and re-closing after that is a further new row. Nothing here
supersedes anything by reference, unlike `z_readings`' own chain: "the latest row for this range"
is already a complete, race-safe answer to "is this day locked", and a chain would only be
answering the same question a second way.

**A calendar range, not a show-night range.** `docs/architecture.md`'s own corrected paragraph on
this exact point: "Every row below carries the financial day for calendar grouping, never the
show night... a month or season total groups by [`london_day`]... Reconciliation to the reader's
own Z is scoped to the show night instead." A term or a season is calendar grouping, the same
kind I-105's day/week/month/term/season selector already reads by `london_day`; the show-night
exception is I-104's own nightly reconciliation, a different question this story does not answer
again.

**The refusal is a single trigger, not an application check in six call sites.**
`ledger_entries_refuses_a_closed_period`, `BEFORE INSERT ON ledger_entries`, reads
`period_locks` for `NEW.london_day` and raises where the latest row is `CLOSED`. Every one of the
six writers already funnels through `postEntry()`; the trigger is what makes the refusal true for
a seventh writer nobody has built yet as well, the same structural guarantee 0058 gave
`performanceId` at the Zod layer rather than trusting a call site to remember. `runLedgerBatch()`,
the one new export from `server/utils/ledger.ts`, wraps `db.batch()`, catches the trigger's raise
by name and turns it into a 409; every caller that used to call `db.batch()` on `postEntry()`'s
statements now calls this instead, and nothing else about any of the six changes.

**No foreign key from `period_locks` to anything it locks, because there is nothing to
reference.** The lock names a date range, not specific `ledger_entries` rows; a row posted after
the close still needs judging against the lock, so there is no fixed set of rows to point at in
the first place. This sidesteps the exact trap H-104 hit designing its own retention (0061): a
foreign key with `ON DELETE CASCADE` into a table this one is not, and `period_locks` is never
rebuilt regardless, so the question 0061 answered does not arise here at all.

**Reopening requires an administrator and the range typed back, the same shape A-123's merge
confirmation uses.** `finance.reopen` is a permission `TREASURER` does not hold and `ADMIN`
automatically does (criterion 4: "requires an administrator"); the confirmation is the lock's own
`from_day` and `to_day`, resubmitted and checked against what is actually being reopened, so a
stale screen cannot reopen a different period than the one on it.

**Closing warns, it does not refuse.** Criterion 5's blocking conditions (nights with no Z
reading, nights with an open variance) are read from I-104's own `nightsMissingAReading()` and
`nightsWithOpenVariance()`, filtered to the range, rather than a second account of the same
figures. The treasurer sees the warning and closes past it if that is the right call; nothing
here makes it a hard gate, because the criterion asks for a warning, not a second permission
check.

**A term is named separately from being closed, in a second table, `periods`.** I-105's own
dashboard already carries a `TERM` period kind waiting on this story, and a term genuinely has no
computable range the way a season does (`committeeYearEnd`): naming one is its own fact, ahead of
whether it is ever closed at all. `period_locks` does not reference `periods`: a close names a
range directly, so closing something that was never defined as a term (an arbitrary date pair)
costs nothing extra, and `periodBounds()` in `shared/utils/season-dashboard.ts` takes `TERM`'s
range as given, the same way it already takes `DAY` and `WEEK`'s, rather than resolving a
`periodId` itself and turning a pure function into one that reads the database.

## Consequences

- The migration adds two tables and one trigger; no existing table is rebuilt, so none of 0052's
  or 0010's traps apply to this pull request.
- `blockingConditionsFor()` compares a night label against a `london_day` range by plain string
  comparison. The two are usually the same string; a night spanning midnight can differ from its
  own calendar day at the edges by at most one day, which is acceptable for a warning a treasurer
  reads before deciding, and is not the boundary the trigger itself enforces.
- A report reading a closed range is stable by construction: nothing can insert into it, so
  re-running the same query twice reads the same rows. No caching or snapshotting was built for
  criterion 3; there is nothing for it to protect against.
- I-108's exports read a period the same way any other report does; closing changes nothing
  about how an export is built, only whether new rows can still appear under it.

## Options considered

- **A `closed_at`/`closed_by` pair directly on a `periods` table, mutated to reopen.** Rejected:
  it is a flag, the exact shape this decision exists to avoid, and "the close history is visible"
  (criterion 4) would need a separate log alongside it rather than being the table itself.
- **A foreign key from `period_locks` to `notification_log`-style dependents, cascading on
  reopen.** Rejected: there is nothing dated to a specific lock row to cascade; a day is locked
  or not by range, not by a set of rows a lock owns.
- **Check the lock in each of the six writers, before calling `postEntry()`.** Rejected: exactly
  the shape that let two writers silently drop `performanceId` for weeks (0058). A trigger is
  checked by the database on every insert, not by whoever remembered to ask first.
