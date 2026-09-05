# 0049: A status change audits itself atomically, the predicate on the write, the log and the caller both on `changes()`

- Status: Accepted
- Date: 2026-09-04

## Context

Three routes each needed the same thing: change a row's status, and write an audit entry for
that change, with no way for a losing racer to log a transition that never happened and no way
for a real transition to go unaudited. Each landed on a different shape.

`server/api/admin/bar/products/[id]/status.post.ts` and
`server/api/admin/bar/items/[id]/status.post.ts` (F-111, F-114) batched an ordinary `db.update`
against the row's id with an unconditional audit insert beside it: whatever the update did, the
audit insert ran. `server/api/admin/bar/variants/[id]/status.post.ts` (F-112) and
`server/api/admin/performances/[id]/index.put.ts` (D-121, E-102) instead put the old status on
the `UPDATE`'s `WHERE` clause and made the audit `INSERT` conditional on `changes() = 1`, D1's
count of rows the immediately preceding statement touched in the same batch. Nothing in the
repository used `changes()` this way before F-112. The `WHERE EXISTS` reads in `tiers.ts`,
`bookings.ts` and `series.ts` look similar but test a precondition true at the time of the read
(a room still active, a bumped booking still bumped); they are not reading back what the
statement before them just did.

0001 says atomicity is `db.batch` only, D1 having no interactive transaction. 0003 says a
contended claim is a conditional write with the predicate on the statement. Neither says how the
audit trail of a conditional write is itself supposed to stay atomic with it, which is why three
routes answered the question three different ways before this record existed.

## Decision

**One shape, everywhere a status change is audited**: the predicate rides the `UPDATE`, and the
audit `INSERT` is conditional on `changes() = 1`, both statements in the same `db.batch`.

```sql
UPDATE <table> SET status = ? WHERE id = ? AND status = ?
--> statement-breakpoint (drizzle-kit only; a batch needs no separator)
INSERT INTO audit_log (id, actor_id, action, target, detail)
SELECT ?, ?, ?, ? WHERE changes() = 1
```

D1 runs a batch's statements in order inside one transaction, and `changes()` reads the row count
of the statement immediately before it in that same connection, so the `SELECT ... WHERE
changes() = 1` sees exactly what this batch's own `UPDATE` did, never another connection's.

**The unconditional-audit shape is wrong**: a losing racer's `UPDATE` touches nothing (its `WHERE`
no longer matches once the winner has moved the row), but the audit `INSERT` beside it runs
anyway and logs a transition that did not happen. Two officers racing to retire the same product
would produce two audit rows for one real change, and the loser's row would misreport who did it
and when.

**An awaited conditional `UPDATE` followed by a separate, unbatched audit `INSERT` is also
wrong**, even though each statement is individually predicated correctly. D1 gives atomicity only
inside one `db.batch` (0001); two round trips are two chances for the process to end, the
connection to drop, or another write to land between them. A `changes() = 1` check read back in
application code and acted on with a second call is a read-then-write gap for the very kind of
mutation this repository does not allow one for.

**The silent-failure mode this must not have**: if `changes()` were ever `0` for a reason other
than losing a race, for example a bug that mistypes the predicate so it can never match, a
privileged mutation would apply with no audit row and nothing would fail loudly to say so. The
`UPDATE` still returns success either way: it is a valid statement that happens to match zero
rows. This is why the pattern ships with tests pinning both halves (a single change writes
exactly one audit row; a raced duplicate writes zero), proved against both a `bun:sqlite` harness
and the real D1 binding, with exact counts rather than a lower bound. A test that only asserts
"at least one audit row" would not catch the predicate-never-matches failure this paragraph
describes.

**The pattern is two halves, not one: the audit is suppressed and the caller is refused, both
from the same `changes()`.** Suppressing the audit insert is not the whole fix if the route still
tells a losing racer it succeeded. The `UPDATE` carries `RETURNING id`, the batch's first result
is captured, and an empty result throws a 409, re-reading current state to build an honest
message, exactly as `server/api/admin/performances/[id]/index.put.ts` already does for its own
capacity race:

```sql
UPDATE <table> SET status = ? WHERE id = ? AND status = ? RETURNING id
```

**The refusal is a thrown HTTP status, not a field in the response body, and that is not a style
choice.** `app/pages/bar/stock/index.vue`, `app/pages/bar/products/index.vue` and
`app/pages/bar/products/[id].vue` all call the status route with `$fetch` and branch only on a
thrown non-2xx via `refusalText`; none of them reads `ok` or `status` out of a successful body.
Returning `{ ok: false }` with a 200 would change nothing on screen: the toast would still say
success and the row would still reload as if the write had applied. The route has to throw.

**A `changes() = 0` batch is a clean no-op against the audit trail's own guard, not a trapped
error.** `0001_audit_log_append_only.sql` puts `BEFORE UPDATE` and `BEFORE DELETE` triggers on
`audit_log`, nothing on `INSERT`. A suppressed insert that matches zero rows never reaches a
trigger at all; it simply inserts nothing.

**No helper**, on the same reasoning as before, now covering the refusal as well as the audit.
The four lines of the batch differ only in table and column names across the three status
routes; the refusal message differs in wording between "already retired", "not retired", "already
active", and what each route says once state has moved out from under the caller. A narrower
helper, `statusChangeBatch(table, id, from, to, entry)`, returning only whether the write applied
and leaving the message to the caller, was considered once the response half doubled the
boilerplate at three call sites. Deferred for the reason the original decision already gives: this
is still three call sites away from the fourth that would make the generalisation argument, and
inlining keeps each route's own wording next to the check it answers rather than behind a
parameter.

## Consequences

- `server/api/admin/bar/products/[id]/status.post.ts` and
  `server/api/admin/bar/items/[id]/status.post.ts` move from an unconditional batched audit to
  this shape in the same pull request as this record, sweeping bar's two routes built before the
  pattern was settled. Both files are bar's by ownership; the fix is not a comment on bar's work,
  it is applying a pattern F-112 (also bar's) proved first.
- `server/api/admin/bar/variants/[id]/status.post.ts` matched only the audit half: its `UPDATE`
  already carried the predicate and its audit insert was already conditional on `changes() = 1`,
  but it discarded the batch's result and returned `{ ok: true, status }` unconditionally, telling
  a losing racer it had succeeded. This pull request adds the response half here too, so it is no
  longer cited as a route needing no change.
- `server/api/admin/performances/[id]/index.put.ts` already matches both halves and needs no
  change; it is the live example the response half above is copied from.
- Any future route that changes a status (or any other contended field) and audits the change
  copies both halves of this shape rather than inventing a fourth one, or fixing only the audit
  half and leaving the caller misinformed.
- **Two more routes run the shape this record rejects, and neither is swept by this pull
  request.** `server/api/admin/training/sessions/[id]/cancel.post.ts` awaits a conditional
  `db.update(...).returning({ id })`, throws 409 when it matched nothing, then writes its audit
  entry with a separate, unbatched `db.insert(schema.auditLog)`. `server/api/admin/rooms/
  external-requests/[id]/reject.post.ts` does the same through `moveRequest()`, which is itself a
  conditional `UPDATE ... RETURNING id`, followed by the same unbatched insert on rejection. Both
  are the awaited-conditional-write-then-separate-insert shape the Decision section calls wrong,
  on a cancelled training session and a rejected external request rather than a status column.
  This record applies to both; the sweep is a later pull request. `docs/known-issues.md` carries a
  row for each so the gap is visible until then rather than only implied by this record's own
  survey being incomplete.

## Options considered

- **Read the row after the `UPDATE`, compare it to the intended new status, and audit only if it
  matches.** Rejected: it is a second read-then-write gap of exactly the kind 0003 exists to
  close, and it costs a round trip `changes() = 1` does not.
- **A shared `auditedStatusChange()` helper taking the table, predicate and audit entry.**
  Rejected for now (see Decision); revisit if a fourth call site's shape turns out to want
  exactly the same parameters, at which point three real examples make the generalisation
  argument for it. A narrower variant scoped to the batch and the refusal check alone,
  `statusChangeBatch()`, was considered separately once the response half was added; see Decision.
- **Trigger-enforce the audit write, the way append-only tables are trigger-enforced (0010).**
  Rejected: these tables are not append-only registers, the audit obligation is specific to
  certain columns changing rather than every write, and a trigger would hide the write path from
  a reader of the route file, which is the opposite of what an audited privileged mutation should
  do.
- **Return `{ ok: false }` with a 200 instead of throwing.** Rejected: every console screen that
  calls one of these routes branches on a thrown non-2xx and never reads the body, so a falsey
  body would be silently ignored and the screen would keep reporting success.
