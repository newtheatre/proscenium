# 0073: An imported pass has no issuer

- Status: Proposed
- Date: 2026-09-14

## Context

`passes.issued_by` was `NOT NULL` from the day D-124 created the table: every pass this system
issues is sold at the desk by a signed-in officer, and the row names them. The old estate kept no
such fact. Its passes exist as sales in one place and as admissions in another, and the migration
reconstructs each pass from whichever of those it finds, with no record anywhere of who took the
money or handed the card over.

The import therefore had three choices for the column: invent an issuer, refuse to import the
pass, or let the column say that nobody is recorded. Inventing one was rejected outright. A
sentinel account named "the import" is a fact the estate never held, dressed up as one it did,
and every later report that groups pass sales by officer would count it as a person. Refusing to
import is worse: the pass is real, its holder expects to be admitted, and the admissions against
it are the history D-119 and 0010 exist to preserve.

## Decision

`passes.issued_by` is nullable. `NULL` means exactly one thing: the pass was reconstructed by the
import from an old sale or admission, and the old estate never recorded who issued it. Every pass
issued here still names its issuer; the desk route writes the signed-in officer as it always did,
and nothing in the application writes `NULL` to the column.

The schema change is a table rebuild, since SQLite has no `ALTER COLUMN`, and `passes` has two
`restrict` dependents (`pass_admissions`, `pass_requests`). The migration,
`0103_an_imported_pass_has_no_issuer`, follows 0063 exactly: both dependents are held, dropped
and recreated around `passes`, `pass_admissions` with its append-only triggers re-created, and the
tag sits in `HAND_REVIEWED_REBUILDS` with the fixture that verified the ordering named in its
comment. `docs/data-model.md` records the meaning of `NULL` on the `passes` entry.

## Consequences

- A screen or a report that names a pass's issuer shows an imported pass as having none, in plain
  words, rather than a placeholder person. Any grouping by issuer gains an "issuer not recorded"
  bucket that is honest about its size.
- The migration writer is the only code that ever produces a `NULL` here. A write route that did
  so would be a defect: the column is nullable for the import's benefit, not as a relaxation of
  the rule that a desk sale names who made it.
- `pass_admissions.admitted_by` already carried the same shape for a different reason (self-serve
  admits nobody on the door), so a reader of the two tables meets one convention, not two.

## Options considered

**A sentinel "import" account as issuer.** Rejected: it fabricates a fact, it gives an account a
name and a role that 0009 says derive from real facts, and it would need erasing from every
officer-facing report by hand.

**Refuse to import a pass with no issuer.** Rejected: it drops real entitlement and real admission
history to keep a column honest, when making the column honest costs one rebuild.

**Keep `NOT NULL` and record the issuer on a side table for imported passes only.** Rejected: a
second table to say that a column is unknown is more schema than the fact deserves, and every
join would still have to know which passes to look up.
