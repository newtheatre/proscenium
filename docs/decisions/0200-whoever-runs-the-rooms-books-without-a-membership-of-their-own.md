# 0200: Whoever runs the rooms books without a membership of their own

- Status: Proposed
- Date: 2026-10-21
- Amends: 0031 (what a membership check blocks), C-105 criterion 2

## Context

Booking a room, asking for one and asking for a Students' Union room all need a current membership
(C-105 criterion 2, A-129). The rule exists because rooms are a membership benefit. It was applied to
everybody, including the officers who look after the rooms.

The hands-on review of 21 October 2026 found that the Theatre Manager and the IT Manager could not
book a room for a production unless they personally held an SU membership. The only route an officer
had without one was bumping somebody else's booking, which is the wrong tool for an empty slot. A
Theatre Manager who is staff, an alumnus or simply between memberships could not do the job the role
exists for.

## Decision

**Holding `rooms.write` stands in for a personal membership when booking or asking for a room.** The
permission is what the Theatre Manager and the IT Manager hold; nobody else does. An officer booking
for a production is acting for the theatre, not taking a member's benefit.

- `mayBookRooms()` (server/utils/bookings.ts) answers the membership question for every member-facing
  room write: a one-off booking, a series, a request, a change to a request, and an ask for a
  Students' Union room. It is true for `rooms.write`, and otherwise asks `hasCurrentMembership()`.
- Every other rule still applies to an officer exactly as before: notice, horizon, the cap, closures,
  opening hours. Only the longest-booking rule was already bent for them (`ROOM_MAX_BOOKING_ADMINS_EXEMPT`).
- The booking form and the Students' Union form no longer show the membership notice to a holder of
  the permission.
- Moving a Students' Union request into one of our rooms still judges the member who asked, not the
  officer moving it.

## Consequences

- An officer without a membership books like anybody else, and their bookings count against their
  own cap.
- Ticket prices are untouched: a member price still needs a membership (0031).
- Another role given `rooms.write` later inherits this. That is intended: the permission means
  looking after the rooms.
