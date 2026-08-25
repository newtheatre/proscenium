# ADR-0039: Refund before cancelling a collected booking, and keep the pair symmetric

**Status:** Accepted · **Date:** 2026-08-25 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

[ADR-0011](0011-collection-is-the-payment-boundary.md) says collection is the payment boundary:
`PENDING` tickets are edited, `COLLECTED`/`DOOR` tickets are refunded, never both, and the only
reversal of a collection is a refund. `PUT /api/reservations/:id` enforced that for four of the five
statuses and let `CANCELLED` through, which put a booking somewhere neither direction reaches.

A customer collects and pays £30 at the desk. Later a member of staff sets the booking to
`CANCELLED`. The seats go straight back on sale, the door reads the booking as cancelled and turns the
customer away, and the money is now unreachable: `POST /:id/refund` refused a `CANCELLED` booking with
"this booking is cancelled and was never collected, so there is nothing to refund", which is untrue,
and putting it back to `COLLECTED` hit the already-paid backstop. Correcting it meant editing D1 by
hand. The £30 also stayed in the expected Z total while leaving reported revenue, so the duty manager
saw a difference the app could not explain.

The obvious repair, dropping the `CANCELLED` exclusion from the existing guard, is wrong. That guard
consults `hasTicketPayment()`, which asks whether a non-voided `TICKET_PAYMENT` line exists and never
looks at `tickets.refundedAt`. A refund stamps `refundedAt` and writes no reversing line, so the
predicate stays true forever. Every properly refunded booking would then be pinned at `COLLECTED`.

## Decision

**Gate the move to `CANCELLED` on money still outstanding, not on a payment ever having existed, and
allow the refund of a booking already stranded.**

- `COLLECTED`/`DOOR` → `CANCELLED` is refused with a 409 naming the amount while any paid, unrefunded
  ticket remains. Refund first, then cancel.
- Once everything is refunded, the transition is allowed, so refund-then-cancel completes. A comped
  booking, where nothing was taken, cancels immediately.
- `assertRefundable()` accepts a `CANCELLED` booking that still carries money taken, so a booking
  stranded before this change, or by any future ordering mistake, is fixed in the app.

Both halves are load-bearing. One direction permitted while the return is blocked is the state that
strands the cash, so the pair stays symmetric.

## Alternatives considered

**Drop the `CANCELLED` exclusion from the uncollecting guard.** Pins every refunded booking at
`COLLECTED` forever, for the reason above.

**Have the refund write a reversing transaction line.** That would make `hasTicketPayment()` a true
"money still held" predicate, and is the tidier long-term shape, but it changes what the day
reconciliation counts and is a larger piece of work than the hole needs. `unrefundedPaidPence()`
answers the same question from the ticket rows without touching the ledger.

**Refuse the transition outright and offer no way back.** Leaves the bookings already stranded
needing hand edits in D1, which is what this exists to stop.

## Consequences

- Staff cancelling a collected booking see a 409 telling them to refund first. That is one extra step
  on a rare path, and it is the step that returns the customer's money.
- The seats stay held until the refund is done, which is the correct order: a customer who has paid
  still holds their seats.
- `unrefundedPaidPence()` (`server/utils/transactions.ts`) is the one place asking "money taken and
  not yet given back". Both guards read it, so they cannot drift apart.
