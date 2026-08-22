# ADR-0023: Money taken is recorded as a transaction; collection remains the boundary

**Status:** Accepted · **Date:** 2026-08-21 · **Deciders:** Matt Adcock (ITM 26/27) ·
Extends [ADR-0011](0011-collection-is-the-payment-boundary.md)

## Context

[ADR-0011](0011-collection-is-the-payment-boundary.md) settled *when* money is taken: nothing is
paid until the tickets are collected, and the boundary is a status transition. That answers the
question it was written for (may this booking be edited, or only refunded) and it answers it well.

It does not answer a different question, and the bar design
([13-bar-design](../13-bar-design.md)) is built entirely on that question: **how much money did the
building take today, and what was it for?** Today the theatre answers it by arithmetic. Bar takings
are the SumUp reader's daily total minus whatever ticket sales were tracked elsewhere. That figure
is a guess dressed as a number, and it is the thing the bar module exists to abolish.

The audit for this work found the gap is wider than the design assumed. The design says the till
should call "the existing box office pay function" and "add a tender to it". **There is no payment
function and no tender.** Collection is a bare status write through the generic
`PUT /api/reservations/:id`. Nothing anywhere records that money changed hands, in what form, taken
by whom. There is nothing to extend; the money event has to be introduced.

A second finding constrains how. **D1 has no interactive transactions.** Drizzle over D1 exposes
`db.batch()` and nothing else, so the design's instruction to call the box office functions "inside
the same D1 transaction", passing a transaction handle down, describes an API that does not exist.
Every multi-statement write in this app already follows the only pattern available: validate and
read everything first, build an array of statements, then one `db.batch()`.

## Decision

**One ledger, written by every screen that takes money.**

`transactions` and `transaction_lines` ([13-bar-design §3](../13-bar-design.md)) are the record of
money taken in the building. One `transactions` row per SumUp tap or comp, whatever mix of ticket
payments, walk-ups and bar items it covers. `source` distinguishes the till from the box office
desk; it does not create a second path.

**Collection stays the payment boundary.** ADR-0011 is extended, not superseded: the status rule and
its refund semantics are unchanged, and the collect action now *also* writes a transaction. The desk
and the till are the same code with a different `source`, and a test asserts a desk payment and a
till payment leave a reservation in identical state.

**Nothing takes a transaction handle, because there is no handle.** The box office's collection and
walk-up code is refactored into **statement builders**: functions that take pre-loaded data and
return `BatchItem[]` plus the figures they computed. One `db.batch()` then writes the transaction,
its lines, the stock movements and the collection transition together or not at all. Signatures of
the shape `recordTransaction(tx, …)` are wrong for this database and must not be written.

Three rules that fall out of the money being real:

- **`taken_on` is computed on the server in `Europe/London`.** The Worker runs in UTC, so a 23:30
  sale in August would otherwise land on tomorrow's reconciliation.
- **The client's total is checked, not trusted.** The figure the server computes must equal the gold
  figure the client displayed, or the write is refused and nothing is recorded. The customer typed
  that number into a card reader; a silent disagreement is a real discrepancy.
- **The batch obeys the parameter cap.** D1 binds at most 100 parameters per statement
  ([ADR-0006](0006-d1-bound-parameter-limit.md)), so basket lines chunk exactly as ticket rows
  already do. A large round is the case that breaks this, and it is a plausible Friday.

## Alternatives considered

- **A till-only ledger, leaving the desk alone.** Much smaller, ships sooner, and permanently unable
  to reconcile: desk payments would be invisible to the very figure the module exists to produce. It
  reinvents "SumUp minus tickets" inside the tool built to replace it.
- **A payments table that mirrors reservation status.** Two sources of truth for one fact, which
  drift the first time a status is corrected by hand.
- **Waiting for interactive transactions on D1.** Not a plan.

## Consequences

- **This is the riskiest change in the programme, so it ships alone.** It is a pull request with no
  bar screens in it, reviewable on its own terms, before anything is built on top.
- Walk-ups from the till consume seats like any other, so they call `assertCapacity`
  ([ADR-0007](0007-one-seat-counting-rule.md)). A new money path is also a new capacity path.
- Reconciliation gets two lenses that must not be confused: *did today balance* is `taken_on`, and
  *how did that show do* is `transaction_lines.performance_id`. An advance payment belongs to one of
  each and to neither of the others.
- Refunds remain the only reversal ([ADR-0011](0011-collection-is-the-payment-boundary.md)) and are
  manager-gated, so a void that touches ticket lines inherits that permission.
