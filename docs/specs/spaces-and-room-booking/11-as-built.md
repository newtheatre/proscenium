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

## Setup (SP-05 to SP-10, SP-12), 24 November 2026

- **Addresses.** The set-up screens are tabs of the module in Admin, reached from the console through the cog, as every module's set-up is: Rooms and resources at `/admin/modules/spaces/bookables` (a bookable at `/admin/modules/spaces/bookables/<id>`) and Purposes at `/admin/modules/spaces/purposes`. Settings are the kit's page at `/admin/modules/spaces`. Part 5's console addresses for these three are not used. The record resolver points a bookable and a purpose at these addresses.
- **Starting purposes (SP-07).** No theatre type is stored when a site is set up, so purposes are not made when the module is switched on. The Purposes screen, while there are none, offers part 6's three lists side by side, each showing what it would make, and "Use this list" makes it in one statement that writes nothing once any purpose exists (`spaces.purposes.started`). Each starting purpose has a fixed slug (`maintenance`, `technical`, `rehearsal`, `audition`, `workshop`, `meeting`, `social`, `hire`) that other modules may look for.
- **A space's control** is set from core's managed flag when it is made bookable, and follows `core.space.managed-changed`; an external contact is cleared when the theatre takes the space on. Only a resource's control is chosen on its Details tab.
- **Archiving (SP-12).** Until the change-and-priority slice brings rule L4's set-wise cancellation, archiving a bookable is refused while it has a Requested or Confirmed booking still to end (`spaces.bookable.has-bookings`, remedy: pause it). When core archives a space or a venue, the listener archives its bookables and announces `spaces.bookable.archived`; cancelling their bookings joins L1 and L2 in that slice.
- **Hours.** A day's openings may not overlap (`spaces.hours.overlap`) and each closes after it opens on the same day (`spaces.hours.backwards`); a closing of 00:00 on the screen is stored as `24:00`. The week is drawn from the day `spaces.calendar.week-starts` names.
- **Purposes in a room (SP-09)** keep only rows that differ from the default: allowed and following the purpose is no row.
- **Not yet.** Requirements (rule P13) are stored on bookables and purposes but not edited on screen until the booking slice, where they are checked. The People tab and the "nobody can decide" health check (SP-13), and the role presets of part 6, come with the approval slice, once `spaces.booking.decide` and the booking abilities are declared: a role preset is offered once, so it must not ship with half its abilities.

Integration tests: `layers/spaces/tests/integration/setup.test.ts`.

## Booking (SP-14 to SP-18, SP-22 to SP-24), 24 November 2026

- **Addresses.** Members book from Members > Room bookings: the calendar at `/members/spaces`, Book a room at `/members/spaces/book`, My bookings at `/members/spaces/bookings` and a booking at `/members/spaces/bookings/<id>`. The navigation entry needs `spaces.calendar.view`.
- **Who may book.** `core.member` carries no abilities of its own, so a theatre gives members the calendar and booking by mapping `core.member` to `spaces.calendar.view` and `spaces.booking.request` (on every bookable, or on chosen ones). Nothing is mapped on switching the module on.
- **The calendar's rooms** come with the calendar: `GET /api/spaces/calendar?from=&to=&bookables=` takes operating days (`YYYY-MM-DD`, at most 31) and answers the bookables the person may see with what they may do in each, and the items in the window. `GET /api/spaces/bookables` stays the set-up list. Performances and closures are drawn with a double edge, the person's own requests dashed, others' requests only for those who may decide them (K3), and others' bookings only as far as `spaces.calendar.show-details` allows (K2).
- **The check as one types (SP-16).** `POST /api/spaces/bookings/check` runs every rule without writing and answers the outcome, the rule and its reason, what is in the way (named as K2 allows) and the nearest free time of the same length on the same day; the form offers to take it. An end at or before the start is read as past midnight.
- **Staff purposes (P2)** are offered to people who may manage bookings in at least one room, and accepted only in rooms where they may.
- **Overrides (P10).** A holder of `spaces.booking.override` is offered the reason box only when the check is refused by P5 to P9; the reason is stored on the booking and the audit records how many rules were set aside.
- **Changing and cancelling (X1, X4, X5).** The booker may change the title, notes and head count until the booking ends, cancel a confirmed booking (inside `spaces.bookings.cancel-notice` it is a late cancellation), or withdraw a request. Staff cancelling someone else's booking must give a note, which is sent to the booker. A booking made by another module is changed there.
- **Sweeps and reminders.** Every 15 minutes confirmed bookings past their end become Completed and requests past their start Expired, set-wise; reminders go once, `spaces.reminders.before` ahead, under the members' notification topic Room booking reminders.
- **Not yet.** The requests queue, decisions and the console screens for staff come with the approval slice; until then a booking that needs approval waits as Requested and expires at its start.

Integration tests: `layers/spaces/tests/integration/booking.test.ts`.
