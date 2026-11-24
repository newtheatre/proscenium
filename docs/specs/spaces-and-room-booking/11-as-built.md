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
- **Occupancy.** Spaces lists the support module `occupancy` under `requires` (R3-03, Matt 2026-11-23); see the Occupancy section below.

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
- **Staff screens.** The requests queue and decisions follow in the approval slice (below).

Integration tests: `layers/spaces/tests/integration/booking.test.ts`.

## Approval (SP-25 to SP-28, SP-31, SP-11, SP-30, SP-13), 24 November 2026

- **Requests** is a console page at `/console/spaces/requests` (navigation entry under Spaces, with a count of requests the person may decide). Each row shows the time, room, purpose, booker, when it was asked, badges (starts soon, clashes with other requests, booked elsewhere or owner asked, how many dates of a series wait), the notes and the booker's no-shows and late cancellations in 90 days. Confirm and Decline open one dialog; a decline needs a note, an external room's confirm needs the owner's reference. Selecting several to confirm at once, the day strip, and "would bump" come with the series and priority slices.
- **Deciding (A2, A4).** `spaces.booking.decide` acts on the booking and refuses its owner, so nobody decides their own request; the queue still lists it, greyed. Confirming runs the clash predicate again; a time taken since leaves the request Requested and answers `spaces.clash`.
- **External rooms (E2).** "Mark as asked" records an `external-placed` event once (`spaces.booking.already-asked` after); the reference is stored in `external_ref`.
- **Messages.** A new request tells everyone who may decide it (a listener on `spaces.booking.requested`, after the request is saved), never the booker. The booker is told of a confirm or a decline (`spaces.request-confirmed`, `spaces.request-declined`; with no note, a fixed sentence stands in) and of a request that lapsed (`spaces.request-expired`, from the sweep). `spaces.remind-approvers` runs daily at 09:00 and sends each approver one `spaces.requests-waiting` message a day while requests they may decide have waited longer than `spaces.requests.remind-after`.
- **Who can decide (SP-13).** A People tab on each room lists who may decide and who may manage its bookings, and counts who may book it. The health check `spaces.no-approver` fails while an active room has nobody to decide.
- **Role presets.** `technical-manager` (view, decide, manage bookings and set up rooms) and `committee-member` (view every booking) are offered when the module is first switched on; a theatre's own role of the same key is kept. Part 6's `administrator` holdings and `small-venue`'s `front-of-house-manager` holding are left to the theatre, since presets are keyed by role and front of house already offers its manager.

Integration tests: `layers/spaces/tests/integration/approval.test.ts`.

## Series (SP-20, SP-21, SP-29), 24 November 2026

- **Making one (R1, R2, R4, R5).** Book a room has a Repeat box, offered only when the purpose may repeat: how often (every day, every week or every other week on chosen weekdays, or every month on the same weekday of the same week), and an end on a date or after a number of times. `POST /api/spaces/series/check` lists every date with its own outcome and reason, under the same rules as one booking; the form shows them as a list, a refused date carries Leave out, and the button reads "Book 9 of 10" (or "Request 9 of 10"). `POST /api/spaces/series` writes the series and every date not left out in one unit: one insert reads them all from one parameter, each row with the clash predicate, and the guard after it refuses the whole series (`spaces.series.clashes`) unless every one was written. The form then checks again, so the list shows what was taken.
- **Limits.** At most `spaces.series.max-occurrences` dates (`spaces.series.too-many`); a purpose with may repeat off refuses (`spaces.series.no-repeat`); a series whose dates would overlap one another refuses (`spaces.series.overlaps-itself`). The purpose's how-far-ahead limit applies to each date.
- **The clock (R3).** Each date starts at the same wall-clock time in the theatre's zone, worked out on calendar dates. A start the clocks skip refuses that date alone (`spaces.series.no-such-time`), and the booker leaves it out.
- **A series is one request (A7, SP-29).** If any date needs a decision the whole series is sent as Requested; approvers are told once, of the first date. The requests page shows a series once, with how many dates wait, and its dialog decides them all at once (`POST /api/spaces/series/<id>/confirm` or `/decline`), or only that date when unticked. A room booked elsewhere is decided date by date, since each needs the owner's reference. Confirming the series runs the clash predicate on every date; one taken refuses all.
- **Cancelling (R6, R7).** A booking in a series offers Cancel this date, Cancel this and later dates, and Cancel every date to come (`POST /api/spaces/series/<id>/cancel` with `from`, or without it). Past dates never change, requests still waiting are withdrawn rather than cancelled, and cancelling every date ends the series. Changing the time of a series is part of the change and priority slice.

Integration tests: `layers/spaces/tests/integration/series.test.ts`; unit tests: `layers/spaces/tests/unit/series.test.ts`.

## Occupancy (R3-03, rule C1a), 24 November 2026

- **Needs occupancy.** `requires: ['occupancy']`, so the occupancy view is on whenever room bookings are, and Admin > Modules lists Room bookings under occupancy's "Needed by".
- **What Spaces reports.** A contribution to `core.space-busy` (`room-bookings`) gives each Confirmed booking of a space's bookable, kind `room-booking`, always yielding. Its label follows K2: the title to the booker, to holders of `spaces.booking.view` on the room and when `spaces.calendar.show-details` is `full`; the purpose's name when it is `purpose`; nothing for `busy` and for a reader of null. Resources take no space and are not reported.
- **Other modules' uses (C1a).** `server/uses.ts` reads `core.space-busy` leaving out Spaces' own contribution. A use is a fourth blocker for a space (`kind: 'use'`, never named on the form: "In use for something else"); the check refuses with C1 and offers the nearest free time around it. Confirming a request, one or a whole series, reads the uses again just before the write and refuses `spaces.clash` if one now overlaps. A use cannot sit on the write's statement, so a use reported between that read and the write is not caught; the module taking the space asks `isSpaceFree` itself, which sees the bookings.
- **The calendar** draws uses in the room's column with a double edge, labelled as the reporting module allows, or "In use".

Integration tests: `layers/spaces/tests/integration/occupancy.test.ts`; the occupancy module's own test now expects Room bookings among the modules that need it.

## Changes, no-shows and erasure (SP-19, SP-35, SP-36), 24 November 2026

- **Moving a booking (X2, X3).** A Confirmed booking not yet started offers "Change time or room" to its booker and to holders of `spaces.booking.manage`: a dialog with the room, day and times and the same live check as Book a room, leaving the booking's own time out (`replaces` on `POST /api/spaces/bookings/check`). `POST /api/spaces/bookings/<id>/move` runs every rule from P1 against the new time with the booking's purpose, production and booker. With no decision needed it moves in one statement carrying the clash condition; otherwise it makes a request with `replaces_id`, and the booking keeps its time. Confirming that request cancels the old booking first, in the same unit, so its time is free for the new one; declining it, or letting it lapse, loses nothing. One change waits at a time (`spaces.booking.change-waiting`). A date of a series can be moved on its own; moving a whole series is not built.
- **What people see.** The booking shows "A change to ... is waiting for a decision" with a link; the request shows the booking it would replace; the requests page marks it "Moves an existing booking".
- **No-shows (X6).** On a Completed booking, holders of `spaces.booking.manage` mark or clear a no-show for 14 days after it ends (`POST /api/spaces/bookings/<id>/no-show`), each once; it feeds the booker's record in the requests queue and nothing else.
- **Erasure (SP-36).** A `core.erasure-handler` contribution cancels the erased person's future Confirmed bookings and withdraws their open requests, set-wise, before the registry anonymises `booked_for` and redacts the free text. Past bookings keep their time, room and purpose. The data download needs nothing from Spaces: the registry finds bookings by `booked_for`.

Integration tests: `layers/spaces/tests/integration/change.test.ts`.
