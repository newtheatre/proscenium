# 0155: A member is told apart by address and student number

- Status: Proposed
- Date: 2026-10-22

## Context

The process map (people, 21 Oct 2026) found several places where an officer recording or checking
a membership could not tell two people apart, or acted before seeing what the action would do:

- the person picker showed a name and an address, so two Immie Harts with personal addresses
  looked the same, and nothing under the field said who had been chosen;
- the register showed the student number *or* the address, never both;
- a membership recorded from a claim said "Recorded by hand", the same as one typed in;
- the claims queue said "3 years" without saying when that term would end;
- **Confirm** on a row wrote at once, and a check cannot be taken back;
- a member could claim a term that had already ended, and a current member had no way in to
  claim a renewal they had already bought;
- a student number of any length was accepted, and a merge dropped the loser's number, so a
  person merged out of a duplicate could no longer be found on the SU's list.

## Decision

**A person is always shown with their address and, where held, their student number.** The
picker lists both on every option and repeats the choice under the field. The register gives the
student number its own column and keeps the address under the name.

**What an action will do is said before it is done.** The queue's term reads "3 years, to
<day>". Confirm asks first, naming the person and the term, and says it cannot be taken back.

**A claim is checked where it is made.** A student number is 6 to 12 digits, on the claim and on
the recording form. A claim for a term that has already ended is refused with the day it ended.
A current member sees **Bought a renewal?**, which opens the same form.

**A membership recorded from a claim says so.** Its evidence already starts `claim `, so the
register reads that rather than adding a column: the source reads "From a claim".

**A merge carries the student number.** The loser's number moves to a winner that holds none;
a winner's own number is never overwritten. The number is unique, so it leaves the loser first.

## Consequences

- No schema change: the source label is derived from evidence the claim already writes.
- A winner and loser holding different numbers keeps the winner's; the loser's goes with the
  tombstone, as it did before.
