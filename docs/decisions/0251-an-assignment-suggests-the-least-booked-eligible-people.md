# 0251: An assignment suggests the least-booked eligible people before anything is typed

- Status: Proposed
- Date: 2026-10-25
- Amends: E-107 criterion 3 (candidates were found by search only). Extends 0210 and 0250.

## Context

The admin review of 24 October 2026 found that filling a gap meant knowing who to look for. Both
assign dialogues listed nobody until two characters were typed, so an officer who did not already
have a name in mind opened the training register in another tab, found who held the module, came
back and typed. The people who were known got asked again and again, and the rest were never
offered a shift.

## Decision

1. **Called with no search, a candidates route suggests.** Both
   `GET /api/admin/rota/shifts/[id]/candidates` and `GET /api/rota/openings/shifts/[id]/candidates`
   return up to eight people who pass the assignment's gate now: they hold the role's module today,
   hold a committee role where the role needs one, are not already on the performance or opening,
   and, for a performance shift, have no clash at another venue.
2. **The fewest shifts ahead come first.** Suggestions are ordered by the claimed and confirmed
   shifts and opening slots each person holds from tonight's show night on, then by name. Every
   candidate, suggested or searched, carries that count, and the dialogue shows it.
3. **Search stays as it was**, matching name or address and showing why a person is locked, for
   when the officer wants somebody the suggestions did not list.
4. **An unnamed eligibility rule suggests nobody**, the way it admits nobody (E-103 criterion 4).

## Consequences

- An officer fills a routine gap in two clicks: Assign, a name, Assign.
- Work spreads across the trained pool instead of falling to the people already known.
- The pool is read in one statement with a fixed number of parameters (0006). The count is a
  correlated subquery per candidate, bounded by the training records for one module.
- Somebody away or unwilling is still suggested; nothing records availability. A future
  availability record would filter here.

## Options considered

- **Order by name.** Simple, but puts the same people at the top every time.
- **Order by shifts worked this term.** Rewards people who have already done a lot with a rest,
  but needs a term boundary the rota does not otherwise read. Shifts ahead answers "who is free to
  take one more" directly.
- **Show every eligible person.** The bar pool can run to dozens; eight is a screen of buttons, and
  search covers the rest.
