# 0190: A comp is kept to the box office

- Status: Proposed
- Date: 2026-10-22
- Amends: who may book a ticket type (D-109 criterion 1), and that a restriction is set once (D-119 criterion 2)

## Context

A ticket type was either open to anyone or for current members only. A Complimentary type at
£0.00, off by default, was turned on for one performance so the desk could give a seat away. The
public booking page then offered it at £0.00 beside the paid types, and a guest booked one online.
Nothing on the type, its price list or the publish sheet said this would happen.

## Decision

**A third restriction, `DESK` ("Box office only"), keeps a type to the desk and the till.**

- `restricted_to` gains the value `DESK`. The column has no CHECK, so this is a write-path change
  only and needs no migration (the comment on the column says why).
- `readBookableTicketTypes()` drops a `DESK` type unless the caller passes the `DESK` channel. The
  desk's ticket types and reservations, the till's walk-up options and the till's sale pass it;
  every customer path (the booking form, a reservation, a waiting-list offer, a ticket change and
  an exchange) keeps the default `CUSTOMER` and never sees the type.
- The public listing and a show's page leave a `DESK` type out of their prices in SQL, so a comp
  is never quoted as "From £0.00".
- **Open and box office only swap on Edit.** Neither changes what any sold ticket was sold under;
  they only change who may be offered the next one. Members only stays fixed at creation, as
  D-109 set it, because widening or narrowing it changes an entitlement a booker already relied
  on.
- The ticket type form warns when a type would be £0.00 and open to anyone, and a show's or a
  performance's price list warns, naming the types, when one resolves to £0.00, on sale and open
  to anyone. Both are warnings, not refusals: a free open night is a real thing a show can do.

## Consequences

- Turning a comp on for a night no longer gives free seats to the public, once the comp type is
  Box office only. An existing Complimentary type is switched with one Edit.
- A type a desk-only comp was sold under still resolves for every report; nothing about sold
  tickets changes.
- Every new customer path must leave the channel at its default; a new staff path must pass
  `DESK` to sell a comp.
