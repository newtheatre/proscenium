# 0048: A notification is one claimed row, updated to its outcome rather than joined by a second

- Status: Accepted
- Date: 2026-09-04

## Context

A sender that must not repeat itself claims before it sends: `claimNotification()` inserts a row
into `notification_log` carrying the idempotency key, and the table's partial unique index on
`claim` refuses a second attempt, so the check is the insert rather than a read followed by a
write (0006). Every claiming call site (training register marking, training expiry, training
promotion, training session cancellation, a cancelled performance's shift notice, seven call
sites in total) then calls `notify()` to actually send, if the claim was taken.

`claimNotification()` writes its claiming row with `status: 'SENT'` and `sentAt` already set,
because at the time it was written that looked like the simplest way to say "this is spoken for".
`notify()`'s own `record()` then writes a second row once the send actually resolves, with the
real outcome. A claimed send is therefore two rows: the claim's, permanently `SENT` regardless of
what happened, and the real one from `record()`. A send that fails leaves a `SENT` row sitting
next to a `FAILED` one, which is a false positive in the log a treasurer or a trainer might read
literally. Two streams (training and show night) have already written `toBeGreaterThan` where a
test wanted to assert exactly one message went out, because "exactly one" stopped being true of
the row count for anything claimed.

The trap this exists to close is a second copy of the same double-write appearing on any future
claiming call site, because the shape looks intentional: a claim row and an outcome row read like
two different pieces of bookkeeping, not one bug.

## Decision

**One send is one row.** `claimNotification()` writes it with `status: 'PENDING'` and no
`sentAt`; `notify()` updates that same row, matched by its `claim` key, to `SENT`, `FAILED` or
`SKIPPED_UNDELIVERABLE` with `sentAt` and `error` set accordingly. `notification_log`'s status
check gains `PENDING` alongside the four it already lists.

**`notify()` takes the claim key as part of what it is asked to send**, not as a lookup it
performs itself: the `Notification` interface gains an optional `claim?: string`. When present,
every outcome branch that currently inserts through `record()` updates the row at that claim
instead; when absent, `notify()` inserts a fresh row exactly as it does today, which is every call
that never claimed in the first place (account and booking notifications, for instance). A call
site that claims and then sends passes the same key it claimed with; six of the seven existing
call sites each already hold that one key in scope, so the change at each is one line. The
expiry sweep's window and final warnings are the exception: several rows, one per expiring
record, can each be claimed for the same user before a single digest-style message covers all of
them, so `claim` also accepts an array and the update matches every key in it. Every branch still
moves together to the same outcome, because they were sent, or not, as one message.

**No trigger and no rebuild.** `notification_log` carries no trigger and is not one of 0010's
append-only registers (the ledger, stock, incidents, age checks, prices, records and the audit
trail). An `UPDATE` on it was always permitted; this decision does not ask for an exception, only
uses one that already existed. A reader checking this against 0010 later should find nothing to
reconcile.

**A stuck `PENDING` row is left visible, not hidden.** If a caller claims and then never reaches
`notify()` (a crash between the two, or a code path that forgets to), the row stays `PENDING`
rather than the old shape's false `SENT`. That is a strictly more honest failure: a query for
`status = 'PENDING'` older than a few minutes finds it, where the old shape gave nothing to find.
Sweeping or alerting on a stuck `PENDING` row is not built by this decision.

## Consequences

- The migration adds `PENDING` to `notification_log_status`'s check and touches no other
  constraint; the column already exists, so no backfill is needed for existing rows (none of them
  are `PENDING` today).
- Every one of the seven claiming call sites changes by one line: the key already computed for
  `claimNotification` is passed again to `notify()` as `claim`. `claimHeld()` is unaffected: a
  `PENDING` row still satisfies "this claim is held", which is the question it answers.
- H-105's retries read and write this same row by further updates (`PENDING` or `FAILED` moving to
  `RETRYING` and then to a terminal status), never a new insert. Building retries against the old
  two-row shape would have doubled whatever it counted; this decision has to land first.
- Every test asserting a notification count for a claimed type can go back to an exact number.
  The `toBeGreaterThan` calls written around this are not fixed by this record; each is corrected
  in whichever pull request next touches the file it is in, cited back to this decision rather
  than quietly tightened as an unrelated diff.
- A dashboard or export reading `notification_log` for "was this sent" must now treat `PENDING` as
  its own state rather than assuming every row is terminal. Nothing built so far reads the table
  that way, so nothing here is known to break, but it is the assumption to check before adding one.

## Options considered

- **A second table for claims, joined to the outcome.** Rejected. It answers the same question
  with two tables instead of one column's extra value, and every reader would need to know to
  join them.
- **Leave the claim row as `SENT` and have `record()` update it in place of inserting, keyed by
  the claim, only on failure.** Rejected. It still reports `SENT` as a fact before the send has
  happened, which is the actual defect: the row is wrong for the whole interval between the claim
  and the outcome, not only when the outcome turns out to be a failure.
- **Give `claimNotification` a matching `resolveClaim()` the caller calls instead of routing the
  update through `notify()`.** Rejected. It would require every call site to handle the SENT,
  FAILED and SKIPPED_UNDELIVERABLE branches itself, which `notify()` already does once; splitting
  that logic out to seven call sites is the more likely place for the next copy of this bug.
