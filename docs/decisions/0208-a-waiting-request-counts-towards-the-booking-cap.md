# 0208: A waiting request counts towards the booking cap

- Status: Proposed
- Date: 2026-10-21

## Context

`ROOM_ACTIVE_BOOKINGS_PER_MEMBER` caps how many room bookings one member may hold at once. The
count behind it (`activeBookingsFor`, and the queue's own count of its requesters) has always
covered every row in `HOLDS_A_SLOT`, which is `CONFIRMED` and `PENDING_APPROVAL`, while the
setting's description said only "active bookings". The rooms review of 21 October found two
things wrong with that:

- Nobody had decided whether a waiting request should count, so the description and the code
  disagreed and a member with several requests was surprised to be over the cap.
- The queue re-judges every waiting request as it reads it (C-109 criterion 1), and it counted
  the request being judged among the member's holdings. A member at the cap with ten requests
  waiting therefore saw every one of them carry "You already hold 10 bookings, which is the
  limit.", including the ones that did not break it when asked, and the badge drowned the
  reason the member gave.

## Decision

**A waiting request counts towards the cap.** A request for one of our rooms holds its slot
while it waits: nobody else can book that span. A cap that ignored requests would let a member
block any number of slots by asking for them, which is exactly what the cap exists to prevent.
The setting's description now says "active bookings and waiting requests".

**A request is never judged against itself.** When the queue judges a waiting request, the
member's count leaves that request out, as changing a request already does (`othersHeld`,
`shared/utils/requests.ts`). The shared helper is `heldBesides` in `shared/utils/queue.ts`. A
request breaks the cap in the queue only when the member's other holdings already reach it.

## Consequences

- The booking form is unchanged: a member at the cap, counting their requests, is still asked
  to explain an extra booking, and the officer decides.
- In the queue, the cap badge appears only on a request that would breach the cap if it were
  confirmed on top of everything else the member holds. With a cap of ten, a member with ten
  requests waiting and nothing else sees no cap badge; with eleven, each carries it, since any
  one of them on top of the other ten would exceed the cap.
- The member's own reason for asking is shown first on the row, above the rules the request
  breaks today, so a rule that has moved since they asked does not hide why they asked.
