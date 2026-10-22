# 0207: A bump holds the offer for the member, and says plainly they can cancel it

- Status: Proposed
- Date: 2026-10-21

## Context

C-115 criterion 3 says a bumped member is "offered the nearest equivalent free slot" and that
"accepting rebooks in one action". What shipped books that slot for them in the same batch as the
bump (`bumpStatements()` in `server/utils/room-writes.ts`), so the member has a confirmed booking
they never asked for, often on another day. The process review of 21 October 2026 found that
surprising: the dialogue said "They will be offered Rehearsal Room 1, 4 Nov", the email said "You
have been booked into ... instead", and neither said plainly that the member could walk away from
it.

Two ways out were weighed. **Offering rather than booking** (a slot reserved until a deadline,
then released unless the member confirms) matches the criterion's wording, but needs a new state
on `room_bookings`, a sweep to release unconfirmed offers, and a table rebuild to widen the status
`CHECK`, which ADR-0037 makes us avoid. It also leaves a member who misses the email with nothing,
which is the outcome the bump is meant to soften. **Holding it and saying so** needs no schema
change and never leaves anybody without a room.

## Decision

**The offer stays held for the member as a confirmed booking**, written in the bump's own batch as
before. Nothing about the data or the write changes.

**Every surface says it is theirs unless they cancel it.** The officer's dialogue says the slot
"is held for them in its place, so they are not left without a room", and that they can cancel
it on My bookings if it does not suit. The `room.booking.bumped` email says "We have held ... for
you in its place, so you are not left without a room. It is yours unless you cancel it: if it does
not suit, cancel it on My bookings and book something else." My bookings, under the bumped row,
says the replacement is held for them in the list and to cancel it if it does not suit. The
officer's toast says what is held, not what was offered.

Cancelling the held slot is an ordinary cancellation (`POST /api/rooms/bookings/[id]/cancel`),
with its own message and calendar file (0132); no new path is needed.

## Consequences

- Amends C-115 criterion 3: "offered" is read as held for the member, and "accepting rebooks in
  one action" as cancelling being the one action if they do not want it.
- A held slot nobody wanted stays booked until the member cancels it, so it can sit empty and
  later be marked as a no-show. An officer marking one should check the member was not simply
  never going to use a slot chosen for them; the copy telling them they can cancel is the
  mitigation, not a rule.
- No migration, no sweep and no new status. If the committee later wants offers that lapse,
  that is a new decision superseding this one, and the rebuild it needs is planned under
  ADR-0037 and ADR-0063.
