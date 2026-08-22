# ADR-0031: The tab charge is the only voidable transaction

**Status:** Accepted · **Date:** 2026-08-22 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

`transactions` has carried `voided_at`, `voided_by_user_id` and `void_reason` since the money
record was built, and nothing has ever written them. That was fine while every transaction was a
card payment: a mistake there is a refund, which is manager-gated and exists already.

Tabs change the arithmetic. The screen they replace is a paper book that people write in
themselves, and a mis-tap on a phone is going to be routine. Without a correction path the honesty
book has no eraser, and the first workaround will be a note asking the bar manager to sort it out,
which is the paper record we set out to remove.

## Decision

**A `TAB` charge may be voided while it is unsettled, and nothing else may be voided at all.**

Because [ADR-0030](./0030-a-tab-is-a-sale-on-credit.md) forbids a ticket line on a tab, a tab void
can never touch a reservation, so the manager-gated refund path
([ADR-0011](./0011-collection-is-the-payment-boundary.md)) is never implicated. The general
transaction void stays unbuilt.

- The debtor may void their own charge; `bar.manage` may void anyone's.
- Only while `tab_settled_at IS NULL` and `voided_at IS NULL`, **checked in the SQL predicate and
  not only in a prior read**. A settled charge is money the reader really took, against a day that
  may already have a recorded Z-total; removing it would leave that day unable to reconcile.
- **Stock is reversed by opposing `VOID` movements copied from the original `SALE` rows**, read by
  `ref_table`/`ref_id`. Both are inserts, so the append-only triggers
  ([ADR-0027](./0027-the-refusals-register-is-append-only.md) and migration `0034`) are untouched.

## Alternatives considered

- **Recompute the depletion at void time** from the catalogue. The obvious implementation, and
  wrong: if `depletes_milli` or `stock_product_id` changed between the sale and the void, the
  reversal does not cancel the sale and `on_hand` drifts permanently with no trace.
- **Build the general void now.** A mixed transaction needs the refund permission for its ticket
  lines and a bar-shift user sent to the desk. That is a real feature and it is not this one.
- **Let people edit a charge.** A transaction is immutable once recorded (13-bar-design §3.2), and
  a tab is the last place to start making exceptions.

## Consequences

- `VOID` joins `MOVEMENT_KINDS`, so a reversal is legible in the ledger rather than hidden among
  adjustments.
- Voided transactions were already excluded from the reconciliation; they now also have to be
  excluded from the sales and night reports, which had never needed it. Fixed in the same change.
- The bar manager can write off an uncollectable tab by voiding its charges with a reason, which
  is the honest record of what happened.
