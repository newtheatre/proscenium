# ADR-0007: One definition of an occupied seat

**Status:** Accepted · **Date:** 2026-08-14 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

"How full is this performance?" was answered in four places with three different filter sets. They
disagreed, and the disagreements were invisible until someone was affected by one:

- The pass redemption check counted tickets on **cancelled** reservations, so pass holders were
  turned away from houses that were half empty.
- The public listings counted `PASS_SALE` rows: the purchase of a pass, which is money but not a
  seat, so a show could read "sold out" while the booking path would still sell into it.

Capacity is also enforced on more paths than are obvious. Two were fixed by routing ticket writes
through `assertCapacity`; a third was missed because it writes a *status* rather than a ticket.
Reinstating a cancelled reservation re-takes its seats: a full house, a ten-ticket cancellation, ten
replacement bookings and an "undo" put the performance ten seats over capacity, silently.

## Decision

**Every seat count in the application goes through `countOccupiedSeats` in `server/utils/tickets.ts`.**

A ticket occupies a seat when it is:

- not refunded (`refundedAt IS NULL`), and
- on a reservation with status `PENDING`, `COLLECTED` or `DOOR`, and
- not of kind `PASS_SALE`.

`PASS_ADMISSION` **does** occupy a seat: a pass grants entitlement, not a reserved seat
([ADR-0002](0002-passes-as-first-class-entities.md)), which is precisely why redemption issues an
ordinary ticket rather than a parallel record.

Every write path that adds occupancy calls `assertCapacity`, including status changes that reinstate
a reservation. Effective capacity is `performance.capacityOverride ?? venue.capacity`; both null
means uncapped.

## Consequences

- The door, the booking path, the public listings and pass redemption cannot disagree about how full
  a house is.
- A new path that consumes capacity is only correct if it calls `assertCapacity`. Writing a status is
  such a path.
- Lowering a performance's capacity override below what is already sold is refused. Otherwise
  `assertCapacity` would then refuse every subsequent ticket change, pass redemption and door sale
  for that performance while the listing reported more sold than the house holds. Raising the
  override remains the sanctioned way to oversell deliberately.
- `assertCapacity` remains a read-then-write with no lock, so two concurrent bookings can both pass
  and jointly oversell by a small margin. Accepted at this volume; recorded in
  [docs/09-known-issues.md](../09-known-issues.md).
