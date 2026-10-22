# 0161: A refusal on the till names the till's bar

- Status: Proposed
- Date: 2026-10-21
- Amends: how the till met F-106 criterion 6 for a refusal given before the charge

## Context

A Challenge 25 refusal given on the till is written to the register at once, before anything is
charged (F-106 criterion 6, 0096). The till sent it to `POST /api/tonight/age-checks` with no
performance and no venue. For a volunteer on a bar shift that was enough: the shift says which
house. For the Front of House Manager working through the officer bypass on a night running two
houses, the guard could not tell which house was meant and refused with "More than one venue is
running tonight". On the hands-on review of 21 October 2026 the refusal never reached the register,
which is a licensing record, and two end-to-end cases had been skipped for it (issue 1582).

## Decision

- The age check form takes an optional `venueId`. The till always sends its own bar's.
- With a `venueId`, the route asks the BAR guard for that venue, as every other till route does;
  without one it keeps asking any of BAR, DOOR or DUTY_MANAGER, so the door and the standalone
  form are unchanged.
- A refusal from the till with no performance named is placed on the house a sale at that bar
  would be, through `performanceForSale`, the same rule a sale uses (F-126).
- The identity check runs before the body is read, so a signed-out caller learns nothing from how a
  body is refused.

## Consequences

- An officer's refusal on a multi-venue night lands on the register under the right house.
- A bar shift's refusal now carries the performance its sale would, where before it carried none.
- The two end-to-end cases skipped for issue 1582 run again.
