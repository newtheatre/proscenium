# 10. As built

Where the build departs from, or is narrower than, parts 1 to 9. The build is the reference from here on.

## Gate (SP-01 to SP-04), 24 November 2026

- **The clash write.** `layers/spaces/server/bookings.ts`. A confirmed booking is one `INSERT ... SELECT` from the purpose's row (which copies the tier in the same statement) carrying `bookableFree`: no Confirmed booking of the bookable overlaps, and for a space core's `assertSpaceFree`, for a resource core's new `assertNoVenueClosure(homeVenueId)`. Confirming a request and moving a booking carry the same predicate. The guard after each is the kit's `expect(1)`, refusing `spaces.clash`.
- **Performances.** `assertSpaceFree` is core's predicate as agreed, so a performance blocks a booking only in a space marked exclusive, the default. Core's turnaround is not added around performances for bookings.
- **State moves.** One `moveBooking` writes every move: an update naming the states it may come from (`MOVES` in `layers/spaces/shared/states.ts`), its history row and its event, in the caller's unit. A move the table does not allow is refused `spaces.booking.wrong-state` before anything is written.
- **Opening hours** past midnight need a second row, as specified; the table refuses `closes_at` after `24:00`.
- **`spaces.calendar.day-ends`** runs to 23:59, not 24:00: the kit's time kind stops at 23:59.
- **Audience** `members` in part 6 is the kit's `signed-in`.
- **Cascades.** The kit's references take no `ON DELETE`, so removing a bookable's hours or purpose rows is done by the code that archives it, not by the database.
- **Abilities** are declared with the first route that needs them, as the conformance check requires; the gate declares only `spaces.settings.manage`.
- **Occupancy.** Spaces will list the support module `occupancy` under `requires` (R3-03, Matt 2026-11-23) once lane A's module is on `next`, and contributes its bookings to core's `core.space-busy` then.

Proof runs P-1 to P-5 and P-7 are integration tests in `layers/spaces/tests/integration/gate.test.ts`, run in workerd against local D1 with every attempt fired at once. P-6 (a series saved whole or not at all) follows with series. The deployed run against a real D1 is still owed.
