# 0129: A close never covers a day already closed, and the close history says what is in force

- Status: Proposed
- Date: 2026-10-14
- Amends: 0064 (how a close is written and how its history reads)

## Context

The hands-on review of 13 October 2026 (round 2, item 2) closed the same period twice and then
closed a range overlapping it. Each close was its own `CLOSED` row. Reopening one of the duplicates
appended a `REOPENED` row, which by 0064's rule (the newest row covering a day governs it) opened
every day of that range, so the SU export called those days Open. The periods screen still listed
the other duplicate as Closed, because it showed each row's own action and not whether the row was
still in force. The treasurer could not tell what was locked. The close preview warned about the
same unreconciled night each time and never mentioned the existing close.

Terms had the same shape: the same label and range could be named twice, the dashboard's term
picker then offered both, and nothing could remove either.

## Decision

**A new close is refused while any day of its range is already closed.** The refusal is the
predicate on the `INSERT` itself (0003): `closePeriod` writes `INSERT ... SELECT ... WHERE NOT
<any day closed>`, so two treasurers closing at once cannot both land. "Closed" is read exactly as
the ledger's trigger reads it: the newest row covering the day, by `created_at` then `rowid`
(0064, #1567). The check probes only the days where the governing row can change (the range's
first day and every existing row's edges inside it), so it binds a fixed number of parameters
however long the history (0001, 0006). A refused close answers 409 naming the close or closes in
the way, and the preview names them before the treasurer presses Close.

To close a longer range around a closed one, close only the days outside it, or reopen it first.
A reopened day is open, so a close over it is accepted.

**Reopening applies only while the lock still governs one of its days.** It copies the lock's
range and label onto the `REOPENED` row and is itself a conditional write, so reopening a close
that a later row has already replaced changes nothing and says so. Reopening still covers the
lock's whole range, as 0064 has it.

**The history shows each row's standing, not just its action.** Every row reads as one of Closed,
Partly closed (a later row governs some of its days), Reopened, or "no longer in force". The
standing is computed by the same newest-row rule over the rows already listed, so the periods
screen, the exports' Open or Closed and the ledger trigger cannot disagree. Reopen is offered only
on a row that is still closed somewhere. Rows written before this decision, duplicates included,
read correctly under the same rule without a migration.

**A term is named once, and a mistaken one can be removed.** `defineTerm` refuses, on its own
statement, a label already used (ignoring case) or a range already named. A term is only a name
for a range: no close, figure or row references it (0064), so removing one is a plain delete,
audited as `finance.period.removed`, behind the console's confirmation (0032).

**Who can reopen is said, not discovered.** A treasurer without `finance.reopen` sees that only
the IT Manager reopens a closed period, and the reopen dialogue asks for the dates as the date
fields show them.

## Consequences

- No migration and no table rebuild: `period_locks` stays append-only and `periods` keeps its
  shape. Existing overlapping rows stay; their standing explains them.
- A close that overlaps a closed range is now two steps for the treasurer (close the outside days)
  instead of one. That is the point: every day has one close in force.
- `periods` is no longer append-only in practice. It never was trigger-enforced, nothing keys to
  it, and the audit trail keeps what was removed.

## Options considered

- **Refuse only an exact duplicate.** Rejected: an overlapping close produces the same
  contradiction on reopen, which the review also hit.
- **Make reopen append a `REOPENED` row for each overlapping close.** Rejected: it hides the
  problem rather than preventing it, and leaves a history no treasurer can read.
- **Show only the latest row per range.** Rejected: 0064 keeps the whole history on screen
  (criterion 4); a standing beside each row keeps it and still answers what is locked.
