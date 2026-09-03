# 0043: A venue is its own row, never a flagged room

- Status: Accepted
- Date: 2026-09-03

## Context

Two tables could plausibly answer "where does this performance happen". `rooms` already exists and
holds the bookable estate, the auditorium among them, with opening hours, a booking policy, a
priority tier and a blackout calendar. `data-model.md` also specifies `venues`, with an address, a
poster image, a public description and an emergency card. The auditorium is both: a room members
rehearse in, and the house we sell seats to.

Building it once, as a room with an `is_venue` flag, was the tempting saving. It is the wrong
saving. A room's columns are about who may book it and when; a venue's are about who is coming to
watch and what they need to know in a fire. Merging them means every room-booking query filters out
venues, every public payload allow-lists around a dozen booking columns, and the emergency card
hangs off a row a member can request for a read-through. It also fixes the count: we perform in
places we do not manage (external hires, festival slots, the SU's own spaces), and a venue that must
first be a room cannot hold one of those without inventing a room nobody may book.

The question was blocking three stories at once. E-101 stamps shift templates per venue, E-113
caches an emergency card per venue, and F-102 opens a bar session per venue and show night. All
three needed to know what a venue is before any of them could be written.

## Decision

**`venues` is its own table.** A venue carries its own name, address, capacity, image, description,
`is_external` flag and emergency card, and nothing about booking it for a rehearsal.

**A venue may point at a room through a nullable `room_id`, and need not.** The attachment has
exactly one effect: **the venue's performances apply blackouts to that room**, so a show night
closes the auditorium to rehearsal bookings without anybody remembering to close it by hand.

**Nothing else is inferred in either direction.** A venue's capacity is not the room's. A room's
opening hours, policy, tier and sensitivity say nothing about the venue. A room never names a
venue: `rooms` gains no column, and a query over rooms never has to know venues exist.

This is committee direction of 3 September 2026, recorded in `docs/build-order.md` under "Decisions
taken to unblock the order" while this record was outstanding.

## Consequences

- The capacity a performance is sold against comes from the venue, or from the performance's own
  `capacity_override`, and never from a room. `effectiveCapacity()` in
  `server/utils/performances.ts` is the one resolution.
- A venue we do not manage is one row with `is_external` set and `room_id` null. It needs no
  fictional room, and it never appears in the rooms estate.
- The blackout that a performance implies is not built here. `venues.room_id` is the seam it will
  read; C-114's `room_blackouts` is what it will write. Until that story lands, a show night does
  not close the auditorium to rehearsals, which is the behaviour the old estate had.
- Two rows describe one physical space, and somebody has to keep the two names recognisable. That
  is the cost, and it is smaller than the alternative: a single row whose meaning depends on a flag
  is a row every reader has to check the flag on.

## Options considered

- **A room with an `is_venue` flag.** Rejected: it cannot hold a venue we do not manage, it hangs
  the emergency card off a bookable row, and it makes every rooms query carry a filter it would
  otherwise not need.
- **A venue with no room reference at all.** Rejected: it is the cleaner separation, but it loses
  the one automation worth having, and the theatre has run rehearsals in the house during a get-in
  because nothing stopped it.
- **Rooms and venues sharing a `spaces` parent.** Rejected as more structure than two tables and one
  nullable column, for a system with one venue and three rooms.
