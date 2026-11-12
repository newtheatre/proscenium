# 0262: A pass type may admit once to each show rather than once to each performance

- Status: Proposed
- Date: 2026-11-11
- Amends: D-125 criterion 2, D-126 criterion 1, D-123

## Context

Every pass admitted its holder once to each performance of every show it covered (D-125), so a
holder of a three-show pass could see the same production every night of its run. The IT Manager
asked on 11 November 2026 for an option to limit a pass to one ticket per show, not one per
performance, chosen per pass type.

`pass_admissions` is append-only (0010) and unique on pass and performance. A cancelled or lapsed
booking keeps its admission row, which is why that performance cannot be booked again on the
same pass; it must not also use up the show.

## Decision

1. **Each pass type says how often it admits.** `pass_types.admission_rule` is `PER_PERFORMANCE`
   (every one so far, and the default) or `PER_SHOW`, added in place. The rule is fixed once any
   pass of the type is out, because holders bought it on that rule; a new rule is a new pass type.
2. **Once per show is part of the redemption predicate.** `passAdmissionAllows` refuses a seat on a
   `PER_SHOW` pass when the pass has a live booking (pending, collected or admitted) on another
   performance of the same show, in the same statement that checks capacity and the performance, so
   two racing bookings for different nights still leave one (0003).
3. **Cancelling frees the show.** Only a live booking counts, so a booking cancelled at the box
   office, or a hold that lapsed, lets the holder choose another night. The performance it was for
   stays spent, as the unique admission row already says.
4. **The refusal names the night already booked**, and the booking page, the pass offer and the
   pass type screen say "one night of each" where the rule applies.

## Consequences

- No row is rebuilt and no existing pass changes how it admits.
- A holder who wants a different night asks the box office to cancel the booking they have, since
  a pass booking is changed or cancelled only there (issue 1390).
