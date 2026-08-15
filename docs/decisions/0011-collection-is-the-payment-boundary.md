# ADR-0011: Collection is the payment boundary

**Status:** Accepted · **Date:** 2026-08-14 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

The theatre takes no money online. A booking is an intention until someone collects the tickets and
pays at the box office. In the theatre's own terms: **nothing has been paid until the tickets are
collected.**

The application originally allowed both ticket editing and refunding on a reservation in any status.
That made both operations unsafe:

- A `COLLECTED` booking could be quietly re-diffed, deleting tickets that had been paid for, with no
  record that anything was returned.
- A `PENDING` booking could be "refunded" for money the theatre had never taken.

## Decision

**Two phases, two mechanisms, decided by status.**

| Phase | Statuses | Operation | Endpoint |
|---|---|---|---|
| Before collection | `PENDING` | Edit the ticket composition freely | `PUT .../tickets` |
| After collection | `COLLECTED`, `DOOR` | Refund only | `POST .../refund` |

Before collection the booking is an intention: the customer or the box office can add and remove
tickets, and removing one is not a refund because nothing was taken.

After collection the composition is a record of a transaction. It must not be edited; the only way to
reverse any part of it is a refund, which is a manager's decision and leaves an audit trail.

`CANCELLED` and `NO_SHOW` are terminal for both operations.

The rule is implemented once, in `server/utils/reservationLifecycle.ts`.

### Refunds are idempotent under concurrency

The refund handler carries `refundedAt IS NULL` in the `WHERE`, not merely in the `SELECT` that
chose the rows. The read and the write are separate statements, so a double-click or two staff
refunding at once both select the same rows and both report success while only one stamp lands —
cash out twice, recorded once. With the guard the loser updates nothing, and `returning()` reports
how many rows the call actually refunded rather than how many it intended to.

## Consequences

- Correcting a collected booking means refunding and re-selling, which is deliberate friction on the
  only path that moves money.
- Status is tracked per reservation; refunds are per ticket via `refundedAt`. A partially refunded
  booking is normal.
- Client-side ticket editors filter refunded tickets out even where the status rule means none should
  be present. The server diffs on `isNull(refundedAt)`, so if the two sides ever disagree an
  unchanged Save would ask for more of a type than the server can see and issue a replacement for a
  refunded ticket. Legacy imported rows are not bound by the new invariant.
