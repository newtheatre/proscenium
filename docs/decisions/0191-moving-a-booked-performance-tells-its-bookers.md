# 0191: Moving a booked performance tells its bookers

- Status: Proposed
- Date: 2026-10-22
- Amends: what editing a performance does (D-121 criterion 2), alongside what 0122 says every copy of a booking carries

## Context

An officer moved a performance's curtain from 19:30 to 20:00 while it held a booking. The edit
saved with "Performance changed": the form gave no warning, and nobody holding a ticket was
told. Their confirmation still said 19:30. Cancelling already tells every booker; moving did not,
though a booker who arrives at the old time is turned away as surely as one who arrives for a
cancelled night.

## Decision

**A new day, curtain or venue emails every booking, after the edit commits.**

- `PUT /api/admin/performances/[id]` compares the saved `startsAt` and `venueId` with what was
  held. If either moved, every PENDING or COLLECTED reservation with an account is sent
  `reservation.performance-moved`, the same set and the same reach (unverified accounts
  included) as a cancellation.
- The email names what it moved from and to, says the booking still stands and the same code
  admits, and links the booking. An unpaid booker is told they can cancel from the booking and
  nothing was charged; a paid one is told to bring the reference to the box office. It promises
  no refund the desk has not agreed.
- The claim key is the reservation with the destination (start and venue), so saving the same
  move twice tells nobody twice, and a later move tells everybody again.
- A doors, running time, capacity, booking window or notes change tells nobody: a booker's
  arrival is the curtain and the venue.
- The edit form warns before saving, when tickets are held and the day, curtain or venue has
  changed; the toast says how many bookings were emailed, and the route answers `bookingsTold`.

## Consequences

- A booker always hears of a move the officer makes on the screen.
- A walk-up sold with no address has nobody to email, as with a cancellation.
- Shift holders are told about a venue move as before; a time change still restamps their window
  without an email, which the rota owns.
