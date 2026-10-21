# 0122: Every copy of a booking says where, when, and what changed

- Status: Proposed
- Date: 2026-10-14
- Amends: D-108 criterion 2 (the confirmation's contents), D-110 and D-111 (what a change sends)

## Context

The hands-on review of 13 October 2026 followed one booking from the show page to the door and found
it never said where to go. Every page named "The Nottingham New Theatre" while `/history` and
`/technical-specification` say that building has been closed since 2023 and the theatre performs in
the Portland Studio; no page, email or `/qr` gave an address. The venue's own row has an `address`
column that nothing on the public side read. The confirmation email and `/qr` also left out the
doors time, the release of an unpaid hold that the booking form had quoted, and each line's price.

Changes were worse. Changing a guest booking from £14 to £19 sent nothing, so the only email still
said £14 was due. An exchange showed no total before it was confirmed (D-111 criterion 2 asks for
one), moved the booking to a new reference by design (criterion 4) without saying so, and sent an
email with the same subject as the first. A cancelled booking said "Book again from the show's page"
and linked nowhere.

## Decision

**The venue's stored name and address travel with every public read of a performance, and every
copy of a booking says where, when the doors open, when an unpaid hold is let go, and what each line
costs.**

- `PublicPerformance` carries `venueAddress`, and the booking read carries the address and the doors
  time. The show page names each venue with its address under "Where" and gives its schema.org
  `location` the address; the booking page's header and stub read "venue, address · Doors hh:mm".
- `/api/qr/current` answers the venue, the doors time and the release time, and each named line
  carries its snapshotted `totalPence`. The confirmation email reads the same facts from the booking
  (`arrivalContext` in `server/utils/reservation-confirmation.ts`), so every path that sends one says
  the same.
- **A change sends a fresh copy.** Saving changed tickets re-sends the confirmation with the same QR,
  subject "Your booking for X has changed" and the new total. An exchange sends "Your booking for X has
  moved", naming the new reference and the booking it replaces, which no longer admits anybody. Both
  are the `reservation.confirmed` type, so no new notification type or template exists.
- **An exchange is priced before it is confirmed.** `GET /api/qr/exchange-options` answers each
  night's `totalPence` for this booking at that night's prices (null when it does not offer one of
  the booking's types, and that night is not offered) and the current total; the form shows "New
  total, was" and says the reference will change. After it lands the page says the old reference no
  longer admits anybody, and the old booking's own page names the new reference.
- **Nothing ends in a dead end.** A cancelled or lapsed booking's page offers Book again (the show
  page, while it is public) and What's on, and the cancellation email links both.
- **The seed matches the content.** The seeded house is "The Portland Studio" with an address taken
  from the about and technical pages. Production venues are whatever the box office records under
  Venues; a venue with no address recorded shows its name alone.

## Consequences

- A booker can find the building from any copy of the booking, provided the box office has recorded
  the venue's address. Recording it is now part of setting up a venue (`content/docs`).
- A change to tickets sends one more email than before. A failed send is logged and never undoes the
  change (0003).
- `exchange-options` reads the bookable types once per night of the show's run: one show, a handful
  of nights, and nothing bound per row.

## Options considered

- **Write the address into the content pages and leave the data alone.** Rejected: the journey reads
  the venue row, and a second copy of the address drifts the day the theatre moves back.
- **A separate "booking changed" notification type and template.** Rejected: it would be a second
  copy of the e-ticket to keep in step; the confirmation with a `change` field says the same thing.
- **Keep the reference through an exchange.** Rejected: D-111 criterion 4 re-issues the e-ticket and
  invalidates the old QR, and the new row is what makes that true.
