# 0085: Visibly over 25 is a till answer, not a register entry

- Status: Proposed
- Date: 2026-09-22

## Context

F-106 criterion 1 has always listed three Challenge 25 outcomes for a restricted basket: not
required, checked and passed, or refused. The till built two of them. Its prompt asked "What ID
was shown?" and offered the four ID types and Refused, so a volunteer serving a customer who is
plainly in their forties had to name an ID that was never shown, or refuse a sale the policy
allows. Challenge 25 asks staff to challenge anyone who looks under 25; a customer who visibly
does not is served without a check, and that is the ordinary case at an interval bar.

The IT Manager's direction is a "visibly over 25" option on Challenge 25 at the till.

Where that answer is written is the question. The register (E-118) is the append-only record of
checks made and refusals given: its `outcome` column is pinned to `ACCEPTED` and `REFUSED` by a
CHECK constraint, and an accepted entry must name an ID. SQLite cannot change a CHECK in place,
so a third register outcome means rebuilding `age_checks`, and 0010 refuses a migration that
rebuilds an append-only register: `check:migrations` enforces it, and 0110 left two such
registers alone for exactly that reason. The choice is therefore between fitting the answer into
the existing shape dishonestly (an `OTHER` ID that was never shown), and keeping it out of the
register.

## Decision

**Visibly over 25 settles the sale and writes no register entry.** It is the first answer on the
till's Challenge 25 prompt, above the ID types, since it is the most common one. Choosing it
settles the basket the way an accepted check does: the line stays, a later restricted press in the
same sale does not ask again, and every charge path (reader, SumUp, tab, comp) accepts it. The
register is untouched, because no check was made: a register of checks that also listed every
unchallenged sale would bury the refusals an inspector is there to read.

**The sale still says so.** The sale's own audit line (`bar.till.sale`) carries the Challenge 25
basis for a basket with a restricted line: visibly over 25, or the register outcome it wrote. The
receipt the till reads back names the basis too. So the night's audit can still answer "on what
basis did this drink go out?" without a register row.

**The standalone register never offers it.** Its two outcome buttons stay ID accepted and Refused:
there is no entry to make for a customer nobody challenged, and offering one there would invite
exactly the noise the register is kept clear of.

**The inline shape grows; the register's does not.** The till's outcome (`inlineAgeCheckForm`)
accepts `NOT_REQUIRED`, the word criterion 1 uses, carrying no ID, no reason and no description.
The register's own forms (`ageCheckForm`, `supersedeForm`) refuse it, and `recordAgeCheck` is never
called with it.

## Consequences

- The register's schema does not move, so 0010 holds and no migration is needed.
- Register counts (the night report's Challenge 25 outcomes, the licensing export) count checks
  and refusals only, as they did. A count of unchallenged restricted sales is available from the
  sale audit lines if a licensing question ever needs it.
- A refusal is still not a pass: after a refusal, the next restricted press asks afresh, and
  Visibly over 25 is one of the answers it offers.
- If the committee ever wants unchallenged sales in the register itself, that is a new register
  shape and a superseding record, not a widening of this one.
