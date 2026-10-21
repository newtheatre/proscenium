# 0120: The waiting list is for a party the house cannot seat

- Status: Proposed
- Date: 2026-10-14
- Amends: D-113 criterion 1 (who may join)

## Context

D-113 is the waiting list for sold-out performances, and the show page only links to it when a
night is sold out. The join route itself never asked: its comment read "a sold-out (or any)
performance", and the join page only refused once online booking had closed. The hands-on review of
13 October 2026 joined the list for The Seagull while it had plenty of seats on sale, was confirmed
by email, and found that neither the join page nor the entry page every email links to ever offered
to book. A visitor who follows an old link, or a link shared by a friend after a release, is told to
wait for seats they could take now, and an offer engine that only runs when seats free never writes
to them.

There is one honest reason to join a list while seats are on sale: the party is bigger than what is
left. A party of six and four seats left cannot book, and an offer for six is exactly what the list
is for.

## Decision

**The join is refused while the performance is on sale and has room for the whole party.** The route
reads the seats held the way the booking read does (`heldSeatsQuery`), and
`waitingListJoinRefusal(remaining, partySize)` refuses when no cap is set or the remaining seats
cover the party. The 409 carries `bookUrl` so the page can offer the booking in the same place.

- The join page, when the performance is on sale, leads with "Seats are still on sale" and a Book
  tickets button. The form sits behind "My party needs more seats than are left", so a bigger party
  can still join, and the server keeps the rule either way.
- The entry page (`GET /api/waiting-list/<token>`) answers `bookable`: on sale, no offer standing,
  and room for the whole party. A waiting, lapsed, claimed or removed entry then offers Book tickets.
- A full house, a closed window and every other refusal are unchanged: D-113 criterion 2 still
  refuses a join after the cut-off.

## Consequences

- Nobody is confirmed onto a list for seats they could book, and the entry page is never a dead end
  while seats are on sale.
- The check is a read before the write, not a predicate on it. A seat sold in between only means a
  party that could have booked a moment earlier joins instead, which is the list's job; nothing is
  oversold, because the list never holds seats.
- One extra read per join, and per entry page view while no offer stands.

## Options considered

- **Leave it, as "or any" said.** Rejected: the review shows it confirms people onto a list nobody
  will ever be offered from.
- **Refuse whenever any seat is on sale.** Rejected: it locks out exactly the large party the list
  serves.
- **Accept the join but book it straight away.** Rejected: a booking needs ticket types and prices
  chosen, and a waiting-list form asks for neither.
