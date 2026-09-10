# 0059: A migration writer keyed to a person guards its conflict branch against one already anonymised in the target

- Status: Accepted
- Date: 2026-09-10

## Context

#806 found that `migration/load.ts`'s upsert could silently reinstate a deleted `totp_secrets` or
`recovery_codes` row for a person erased in the unified system: the old estate cannot know about
an erasure that happened here, so a stale weekly export still carries their live credential, and a
delete leaves nothing for a conflict to catch, so the re-insert is a clean `INSERT` with no upsert
to trip over. Fixed there by a guard on every generated statement: refuse to insert or update a
row for a person already anonymised in the target, evaluated against the target's live state, not
the source's stale belief.

K-113 ("every module's import keyed on the canonical id") is the same hazard at estate scale, not
a new one. Auditing `migration/bookings.ts` (C-118, already merged) for the same shape found a
second, real instance: `INSERT OR REPLACE INTO room_bookings` (and `room_series`,
`external_requests`) has no such guard. Erasure (`shared/utils/erasure.ts`) scrubs a booking's
`title`, `notes` and `rejection_reason` rather than deleting the row (utilisation survives an
erasure; the member's words about it do not). Proved with a failing test before the fix: import a
booking with real notes, erase the person (the booking scrubs to `title = 'Erased booking'`,
`notes = NULL`), then re-run the import from the same, unchanged source. Without a guard, `INSERT
OR REPLACE` restores `title = 'Rehearsal'` and the original notes text, undoing the scrub outright.

Two shapes, not one, which is why the fix is not identical in both places:

- **A table erasure deletes** (`totp_secrets`, `recovery_codes`): there is no legitimate reason a
  migration writer ever inserts a fresh row here for a person already anonymised. The guard blocks
  every write, insert and update alike.
- **A table erasure scrubs** (`room_bookings`, `room_series`, `external_requests`, and by the same
  reasoning `role_grants`): the row surviving an erasure is the point (0011's own "booking and
  sales statistics must survive a user erasure"). A first-ever import of a booking for an already
  anonymised person is legitimate, and an existing accepted test
  (`tests/integration/booking-import.test.ts`, "a tombstone keeps its bookings") already relies on
  it. Only the conflict branch, the one that would overwrite a row erasure may already have
  scrubbed, needs the guard.

## Decision

**Every migration writer keyed to a person applies the same predicate on its conflict branch:**
`NOT EXISTS (SELECT 1 FROM users WHERE id = <that row's user> AND anonymised_at IS NOT NULL)`,
evaluated against the target at apply time, which is the only place the current truth lives. Two
equivalent shapes, depending on how the writer already builds its SQL:

- `migration/load.ts` builds fully literal SQL per row (`buildLoad()` reads the core once and
  writes text), so its guard inlines the person's literal id directly.
- `migration/lib.ts` now exports `NOT_ANONYMISED(table)`, a column-qualified version
  (`NOT EXISTS (SELECT 1 FROM users WHERE id = ${table}.user_id AND anonymised_at IS NOT NULL)`)
  for a writer using parameterised `INSERT ... ON CONFLICT (id) DO UPDATE SET ... WHERE`, which
  `migration/bookings.ts` now uses for all three tables it owns. A future writer (K-113's own
  scope, as further modules gain an import) reaches for whichever shape matches how it already
  builds its SQL, citing this record rather than re-deriving it.

**Whether a fresh insert is also guarded follows the table's own erasure semantics, already
decided in `shared/utils/personal-data.ts`, not reargued here**: `erasure: 'delete'` blocks every
write; `erasure: 'scrub'` blocks only the conflict branch. A writer does not choose; it reads its
own table's registry entry.

**K-113's keying question, settled without reshaping anything.** Every import already joins on the
fresh unified `users.id`, resolved through `out/id-map.tsv`, never a legacy id column (0015,
`identity.ts`'s own comment: "a mirror id absent from auth is an exception, never a guess
(K-113)"). This record does not change that. K-113 is the story that wires every remaining
module's transform through the same join and the same guard, not a redesign of either.

## For A-123 (application-level account merging), not this record's call to make

A-123 merges two *live* accounts within the running application, not a batch import from a stale
external source. The hazard is the same (0011: an anonymised row is never written back over), but
the shape is different enough that the same per-statement guard is very likely the wrong
mechanism there. A migration writer touches thousands of rows per run and must keep going past the
few that are guarded; A-123 names exactly two accounts in one administrator action, and can simply
refuse outright, before anything moves, if either the winner or the loser is already a tombstone:
there is no duplicate-account problem left to solve for someone already erased, and running the
merge's own tombstone step twice is exactly the case `eraseAccount()` already treats as a no-op
success rather than an error. This is not adopted here as A-123's decision, since it is not this
story's to make; it is the answer proposed for A-123 to confirm or to deliberately diverge from,
in writing, rather than the two stories silently disagreeing about the same tombstone.

## Consequences

- `migration/load.ts` and `migration/bookings.ts` now agree on one mechanism, expressed in the
  shape each already used.
- A future migration writer (K-113's remaining modules) is expected to import `NOT_ANONYMISED`
  from `migration/lib.ts` and apply it on its own conflict branch, reading its table's erasure
  entry in `personal-data.ts` to decide whether a fresh insert also needs it.
- **Open, deliberately not closed here**: a first-ever import inserting a fresh `room_bookings`
  row for an already-anonymised person carries the source's real, unscrubbed `notes` and
  `rejection_reason`, because nothing pre-scrubs an insert to match what erasure would have done.
  The existing accepted test treats this as fine for `title`, which the transform sets itself
  (`event_title` from the source, never scrubbed either way in today's coverage); whether `notes`
  and `rejection_reason` on a genuinely fresh row should be pre-scrubbed the same way is a real
  question this record does not answer, flagged rather than guessed at.

## Options considered

- **Guard every write unconditionally, insert included, everywhere.** Rejected: it would silently
  reverse the accepted behaviour "a tombstone keeps its bookings" (utilisation surviving an
  erasure), which is 0011's own stated invariant, not a bug to fix.
- **One shared SQL-building helper for every writer, literal or parameterised.** Rejected as
  unnecessary complexity: the two writers already build SQL two different ways for reasons
  unrelated to this guard (`load.ts` stages through a core database first; `bookings.ts` targets
  the real schema directly with real foreign keys), and forcing one shape onto both would be a
  bigger change than the guard itself.
