# 0085: Visibly over 25 is a register outcome, and the empty register is rebuilt once to take it

- Status: Proposed
- Date: 2026-09-22

## Context

F-106 criterion 1 has always listed three Challenge 25 outcomes for a restricted basket: not
required, checked and passed, or refused. The till built two of them. Its prompt asked "What ID
was shown?" and offered the four ID types and Refused, so a volunteer serving a customer who is
plainly in their forties had to name an ID that was never shown, or refuse a sale the policy
allows. Challenge 25 asks staff to challenge anyone who looks under 25; a customer who visibly
does not is served without a check, and that is the ordinary case at an interval bar.

The IT Manager's direction is a "visibly over 25" option on Challenge 25 at the till. The first
cut of this record kept it out of the register: the register's `outcome` column is pinned to
`ACCEPTED` and `REFUSED` by a CHECK constraint, SQLite cannot change a CHECK in place, and 0010
refuses a migration that rebuilds an append-only register. The IT Manager's answer was that the
register holds nothing yet and may be rebuilt. That changes the trade: the reason 0010 refuses a
rebuild is the rows it would put at risk, and there are none.

## Decision

**Visibly over 25 is the register's third outcome.** `age_checks.outcome` takes `NOT_REQUIRED`,
the word criterion 1 uses, carrying no ID type and no reason: nothing was checked, and the shape
constraint says so as firmly as it says an accepted entry names an ID and a refusal names why.
The description is optional for this outcome alone, since there is nobody to describe having
been challenged; it stays mandatory for a check and for a refusal (E-118 criterion 2).

**The till writes it like any other outcome.** Visibly over 25 is the first answer on the till's
Challenge 25 prompt, above the ID types, since it is the most common. It settles the basket the
way an accepted check does, every charge path accepts it, and the register entry lands with the
sale the way an accepted check's does. So the register answers "on what basis did this drink go
out?" for every restricted sale, and the night report and the licensing export count all three
outcomes.

**The standalone register offers it too**, as a third outcome button that asks for neither an ID
nor a reason: a check logged from the door or the bar away from the till is the same record.

**The register is rebuilt once, by hand, while it is empty.** This is the one named exception to
0010's refusal, and it is an exception because of a fact, not a preference: no production row
exists, so nothing a rebuild could lose is there to lose. The migration follows 0063 to the
letter: every row that does exist in any database is carried forward, the self-referencing
correction link is held aside and restored because `RESTRICT` fires row by row inside `DROP
TABLE`, the four indexes and the two append-only triggers are recreated after the rename, and
`check:migrations` waives only its dependent check for this file, with the fixture that verified
the ordering named beside it. The moment the register holds a real row, 0010's refusal applies
to it in full again.

## Consequences

- One migration, `0112`, rebuilds `age_checks`. It is the only rebuild of an append-only register
  in this repository's history, and the record of why is here.
- `saysOutcome` reads `NOT_REQUIRED` as "Visibly over 25" everywhere the register is shown:
  tonight's list, the CSV and PDF export, the night report's counts.
- A refusal is still not a pass: after a refusal, the next restricted press asks afresh, and
  Visibly over 25 is one of the answers it offers.
- A description that is empty is stored as an empty string, never NULL, so the column's shape
  does not move and an export column stays a string.

## Options considered

- **Keep it off the register and on the sale's audit line only** (the first cut of this record).
  Honest, and needed no migration, but it split the basis of a restricted sale across two records
  and left the register unable to say why a drink went out. Rejected once the rebuild was open.
- **Store it as an accepted check with an ID of Other.** A lie in licensing evidence. Rejected.
