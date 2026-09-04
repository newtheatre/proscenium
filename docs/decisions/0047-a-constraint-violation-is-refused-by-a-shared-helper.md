# 0047: A constraint violation is refused by a shared helper, each module keeping its own table

- Status: Accepted
- Date: 2026-09-04

## Context

Show night's E-101 needed a confirmed-duty-manager index, a slot-uniqueness index and an
open-names-nobody check to fail as a readable 409 rather than a raw database error reaching a
caller as a 500. It wrote `shiftConstraintRefusal` in `shared/utils/rota.ts`: a small table
mapping a constraint's name to what a person reads, and a function that pulls the violated name
out of the thrown error and looks it up.

Nothing like it existed anywhere in the codebase before E-101. It will not stay unique to the
rota for long: the bar's `stock_movements` is append-only over a foreign key, the ledger and
incidents are append-only, age checks are append-only, and every one of them will eventually want
the same shape of answer at its write path. Generalising after the second copy is the usual rule;
this generalises after the first, because the shape is now proven and the alternative is three or
four modules each reinventing the same regular expression with their own small differences in how
carefully it is anchored.

Show night's reviewer found the defect the second implementation was for: `shiftConstraintRefusal`
matches `constraint failed:` anywhere in the thrown error's message, not anchored to where SQLite
and D1 actually put it. A local `better-sqlite3` violation reads exactly
`UNIQUE constraint failed: shifts.performance_id`; D1 wraps it as
`D1_ERROR: UNIQUE constraint failed: shifts.performance_id: SQLITE_CONSTRAINT`. Both begin with
one of those two shapes and nothing else does, so an unanchored match is not needed to catch them
and is wrong to use: an error whose message merely contains that substring elsewhere, for
instance a user-entered note echoed back into an unrelated failure, would be misread as a
constraint refusal and answered with a friendly 409 instead of surfacing as the defect it is.

## Decision

**`shared/utils/constraint-refusal.ts` exports one type and one function.**
`ConstraintRefusal` is `{ violated: string, says: string }`: the constraint or index name SQLite
names in its message, and the sentence a person reads. `constraintRefusal(table, error)` takes a
module's own array of these and the caught error; it returns `{ statusCode: 409, statusMessage }`
when the error matches one of the table's entries, and `null` when it does not.

**The match is anchored to the two real shapes, not to the substring.** The pattern requires
`UNIQUE`, `CHECK`, `FOREIGN KEY`, `NOT NULL` or `PRIMARY KEY` followed by `constraint failed:` at
the start of the message, optionally preceded by D1's `D1_ERROR:` prefix and followed by its
`SQLITE_CONSTRAINT` suffix, and nothing else either side. A message that contains the phrase
anywhere but that position does not match, and `constraintRefusal` returns `null` for it exactly
as it does for an error it has never heard of: unrecognised is always a defect a caller rethrows,
never a guess.

**Each module keeps its own table, in its own file, rather than one list every module appends
to.** `shared/utils/ledger.ts`, `audit-actions.ts` and the other five files in the shared-registry
convention hold one array per file that every module writes a banner section into, because those
values are read across module boundaries (a report groups by ledger kind regardless of who posted
it). A constraint refusal is read by exactly one write path, the one whose table it is guarding,
so there is nothing to gain from centralising it and a cost to doing so: every module's pull
request would touch the same file. `SHIFT_CONSTRAINT_REFUSALS` stays in `rota.ts`; the bar's and
box office's tables live wherever their own constrained writes live. The shared file carries only
the function and the type both sides of that boundary need to agree on.

**Adoption is a follow-up, not a rewrite in place.** `shiftConstraintRefusal` continues to exist
and to ship show night's current pull request unchanged; show night switches its own call sites to
`constraintRefusal(SHIFT_CONSTRAINT_REFUSALS, error)` once this merges, in its own pull request.
The bar and box office adopt the shared helper directly, the first time either of them adds a
table that needs one.

## Consequences

- `shiftConstraintRefusal`'s unanchored regular expression is not fixed in place by this record;
  it is retired when show night adopts the shared helper. Until then the defect it could cause
  (a coincidental substring misread as a refusal) remains possible on the rota's own write paths,
  which is why the follow-up is named here rather than left to be rediscovered.
- A module adding a constrained table writes its own `ConstraintRefusal[]` beside the schema or
  the write path it guards, and calls `constraintRefusal` with it. There is no registry to append
  to and no banner to add: the isolation the banner convention buys the eight shared registries is
  had here for free, because the table already lives in the file that owns it.
- `constraintRefusal` returning `null` is not optional to handle: a caller that does not rethrow
  on `null` turns every unrecognised database error into a silent 409, which is the shape of
  defect this record exists to prevent, not permit.
- A future table whose constraint name collides with another module's, by coincidence of naming a
  column the same way, causes nothing: each table is checked only against the module's own array,
  never against another module's.

## Options considered

- **One shared array, banner per module, like `LINE_KINDS`.** Rejected. Those eight registries
  are read across module boundaries; a constraint refusal is read only by the write path that
  raised it, so sharing the array buys nothing and costs a merge hunk every module would share.
- **Fix `shiftConstraintRefusal`'s anchoring in place and leave it module-specific.** Rejected.
  The bar and box office would each write their own version of the same function days apart, each
  either carrying or missing the same anchoring fix independently.
- **Anchor only to the start of the message, ignoring the D1-wrapped shape.** Rejected. D1 is
  where this runs in production; a helper that only matches the local shape passes every test
  against `better-sqlite3` and fails silently the first time it sees a real D1 error.
