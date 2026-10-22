# 0171: The Treasurer takes the ticket export, and a refund asks that it is still you

- Status: Proposed
- Date: 2026-10-22
- Amends: D-129 (who takes the ticket sales export); D-116 criterion 1 (refunding a paid ticket)

## Context

The process map of 21 October 2026 found two gaps in who may do what with ticket money. The
Treasurer reconciles the ledger but could not take the ticket sales export, which only
`ticketing.export` (the Front of House Manager) reached from Box office, Shows. And refunding a
paid ticket at the desk asked for nothing beyond the session, while approving a desk comp, which
gives away less, asks a stale session to confirm it is still the same person (0116, A-128).

## Decision

- **The Treasurer takes the ticket sales export.** `GET /api/admin/tickets/export` accepts
  `ticketing.export` or `finance.export`. The card moves into `TicketExportCard`, shown on Shows
  to `ticketing.export` and on Money, Exports to `finance.export`. The file names nobody (D-129
  criterion 3) and every copy is audited as before.
- **A refund asks that it is still you.** The refund route calls `requireFreshSession()`, the
  check a comp approval makes. So that nobody hands money back on the reader and is then refused,
  the desk asks `GET /api/box-office/desk/refunds/ready` as the refund dialogue opens: a stale
  session confirms itself first, and the dialogue opens once it has.

Matt Adcock chose both on 22 October 2026.

## Consequences

- A refunder who signed in more than `REAUTH_WINDOW_MINUTES` ago confirms it is still them once
  before the reader is touched; any sign-in method they hold will do.
- The Treasurer can download ticket rows they could already reconcile from the ledger; nothing
  personal is added.

## Options considered

- **Give the Treasurer `ticketing.export`.** It would also show the card among box office screens
  they never use, and widen a permission another role owns.
- **Check freshness only when the refund is recorded.** Simpler, but the reader would already
  have paid the money back when the refusal arrived.
