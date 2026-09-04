# 0049: A status change audits itself atomically, the predicate on the write and the log on `changes()`

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

**No helper.** The four lines above are the whole pattern, and every call site's audit `detail`
differs in shape, so a wrapper would need to take the table name, the id, the two predicate
values, the audit action, the target string and the detail object, which is not shorter or
clearer to read at the call site than writing the two statements. A written pattern, cited from
this record, is what every future status-change route copies.

## Consequences

- `server/api/admin/bar/products/[id]/status.post.ts` and
  `server/api/admin/bar/items/[id]/status.post.ts` move from an unconditional batched audit to
  this shape in the same pull request as this record, sweeping bar's two routes built before the
  pattern was settled. Both files are bar's by ownership; the fix is not a comment on bar's work,
  it is applying a pattern F-112 (also bar's) proved first.
- `server/api/admin/bar/variants/[id]/status.post.ts` and
  `server/api/admin/performances/[id]/index.put.ts` already match this shape and need no change;
  they are cited above as the live examples because they are what F-112 and D-121 already got
  right.
- Any future route that changes a status (or any other contended field) and audits the change
  copies this shape rather than inventing a fourth one.

## Options considered

- **Read the row after the `UPDATE`, compare it to the intended new status, and audit only if it
  matches.** Rejected: it is a second read-then-write gap of exactly the kind 0003 exists to
  close, and it costs a round trip `changes() = 1` does not.
- **A shared `auditedStatusChange()` helper taking the table, predicate and audit entry.**
  Rejected for now (see Decision); revisit if a fourth call site's shape turns out to want
  exactly the same parameters, at which point three real examples make the generalisation
  argument for it.
- **Trigger-enforce the audit write, the way append-only tables are trigger-enforced (0010).**
  Rejected: these tables are not append-only registers, the audit obligation is specific to
  certain columns changing rather than every write, and a trigger would hide the write path from
  a reader of the route file, which is the opposite of what an audited privileged mutation should
  do.
