# 0060: A merge refuses outright if either account is already a tombstone

- Status: Accepted
- Date: 2026-09-10

## Context

0059 found the same hazard twice in the migration importers: a stale write keyed to a person can
land after that person has been anonymised, either reinstating a deleted credential or overwriting
a scrub with the source's original, unscrubbed text. Its fix is a per-statement guard on each
writer's conflict branch, because a batch importer walks thousands of rows from a source that
cannot know about an erasure that happened here, and must keep going past the few rows a guard
turns away.

A-123 (merging duplicate accounts) is the same invariant, 0011's "an anonymised row is never
written back over", in a different shape. 0059 proposes, without deciding, that A-123 should
refuse the merge outright, before anything moves, if either account is already a tombstone,
rather than guard each statement the way a migration writer does.

## Decision

**Adopted as proposed.** `server/utils/account-merge.ts`'s `guardMergeable()` reads both accounts
before anything is written and throws a 409 if either `anonymised_at` is not null, whichever side
it is on. Nothing about the merge's own statements needs a `NOT_ANONYMISED`-shaped guard, because
nothing runs until this check has passed.

This is the right shape here for the reason 0059 gives and not the reason a per-statement guard
exists: A-123 names exactly two accounts in one administrator action, so "refuse before anything
moves" is available in a way it is not to an importer that cannot enumerate what it is about to
touch in advance without the same query the guard would be. A merge into or out of an already
anonymised account is never a real request: there is no duplicate-account problem left to solve
for someone already erased, and a fresh administrator action that turns out to name a tombstone is
better told so plainly than allowed to silently do nothing.

**Refused, not idempotent, and that is a deliberate difference from `eraseAccount()`.**
`eraseAccount()` is called by a retried system process (the retention sweep, and `stage-door`'s
GDPR hooks) and treats a second call against an already-anonymised row as a no-op success, because
a retry must not fail merely for having already succeeded. A-123's merge is a single interactive
administrator action, not a retried background job: there is no caller here that needs "already
done" to read as success, and an administrator who asks to merge a tombstone almost always has the
wrong account in front of them. The 409 names that plainly rather than returning a quiet
`{ merged: false }` an administrator could easily miss.

**The race between the check and the batch is accepted, not closed, on the same terms
`wouldStrandTheSystem()` already stands on.** D1 has no interactive transaction (0001), so a
tombstone written by another process between `guardMergeable()`'s read and the merge's own
`db.batch` is possible in principle. The batch's own tombstone statement still predicates on
`anonymised_at IS NULL` and its result is checked against `changes()` before the caller is told the
merge succeeded (0049), so a raced double-merge cannot itself produce two winners or a corrupted
tombstone; the narrow remaining case is a set of row-moves committing in the same transaction as a
tombstone write that then turns out to match zero rows, refused after the fact rather than before
it. This is the same shape `server/utils/authorise.ts`'s last-administrator guard already accepts
for the same reason: closing it fully would need D1 to offer more than a batch, which it does not.

## Consequences

- `server/utils/account-merge.ts` needs no `NOT_ANONYMISED`-shaped predicate on any of its
  statements; the refusal happens entirely before the batch is built.
- A future change that makes a merge span more than two accounts, or that lets it run
  unattended, should revisit this record rather than assume the reasoning still holds: both
  premises this decision rests on (a known, small set of named accounts; an interactive caller
  who benefits from a loud refusal) would no longer be true.

## Options considered

- **Guard every merge statement individually, the migration-writer shape.** Rejected: correct in
  spirit but redundant here, and more code for no more safety, since the wholesale check already
  in `guardMergeable()` makes every statement's own precondition true by construction before it
  runs.
- **Treat a merge against a tombstone as an idempotent no-op, mirroring `eraseAccount()`.**
  Rejected: nothing calls this path on a retry, and a silent success would tell an administrator
  who has the wrong account open that nothing was wrong, which is worse than a clear refusal.
