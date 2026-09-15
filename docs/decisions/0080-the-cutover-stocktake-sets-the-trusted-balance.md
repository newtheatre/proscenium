# 0080: The cutover stocktake sets the trusted balance, and damage is written off rather than repaired

- Status: Accepted
- Date: 2026-09-15

## Context

Module F's second open question asked whether the imported stock-movement history is authoritative
for opening on-hand or informational only, with the cutover physical count establishing the
trusted balance, and which of the audit's three documented data-damage repairs run as repairs
rather than as explicit write-offs.

Part of it answered itself. A production export on 6 September 2026 (`migration/inventory.ts`)
found nothing to carry: `stocktakes`, `stocktake_lines`, `stock_deliveries` and
`stock_delivery_lines` all zero rows, and four rows in `stock_movements` whose quantities sum to
zero. K-116 is resolved as satisfied by procedure and `migration/README.md` lists the bar among
what is not imported. What is still unwritten is the rule, and the rule is what matters: the
question will come back the first time somebody finds a spreadsheet, opens a second bar, or asks
whether the old container sizes can be "fixed" on the way in.

## Decision

**The most recent applied stocktake is the trusted balance.** Nothing else is. On-hand is the sum
of movements (F-114 criterion 2) and a stocktake is how that sum is made to agree with the shelf.
At cutover there is no history, so every item's expected quantity is nought and the first count
posts as its own `STOCKTAKE` movements through F-115's apply route. No import step precedes it and
no second screen exists to do it.

**Stock history, if any ever arrives, imports as informational and never as the balance.** A
second venue's records, a hand-kept spreadsheet or a later dump may be loaded for reference, but
the opening balance is still the count. History that disagrees with the shelf loses.

**No damaged row is repaired.** None of the three documented repairs runs as a repair. A repaired
row is a claim with no source, and the ledger it would sit in is append-only (0010): the correction
could never itself be corrected. Damage is written off explicitly instead, by a dated movement with
a reason, so the write-off is visible as an event rather than hidden as a number that was always
that way. The old estate's container semantics are not repaired at all; 0017 replaced them with
serving-size variants, and the count is taken in the new units.

**`OPENING_BALANCE` is the reason for a balance set outside a stocktake**, on an `ADJUST` movement:
a new item that already has stock on the shelf, most often. The cutover count itself does not use
it, because a stocktake posts `STOCKTAKE` movements and needs no reason.

**Where the delivered cost of opening stock is known, record it as a delivery first.** Gross
profit prices depletion from the deliveries an item has had (F-119 criterion 1), so stock counted
in has no cost and the first weeks read as pure profit. Posting the opening stock as a `DELIVERY`
with its cost, and letting the stocktake confirm it, gives the cost basis something to work from
and leaves the count as the check it is meant to be. Where the cost is genuinely unknown, the
count stands alone and that item's cost basis starts at the next delivery.

## Consequences

- The cutover is a procedure, written up in `docs/operations.md` under "The bar's opening
  balance", not a migration step. Nothing in `migration/` touches the bar.
- **The first count has to be complete.** An item nobody counted stays at nought, and the first
  sale of it drives on-hand negative, which the sale trigger refuses outright (0071). The bar
  manager reads the uncounted list before applying, which F-115 criterion 2 already shows.
- An item counted in without a delivery contributes nothing to the cost side of gross profit until
  one lands. That is visible rather than wrong, and the paragraph above says how to avoid it.
- The old estate's bar catalogue (40 products, 34 prices, 18 recipe items, 5 categories) is a
  separate question, live for the committee under K-116's resolution and untouched here. This
  record is about balances, not about what is on the menu.

## Options considered

- **Import the movement history as the opening balance.** Rejected before it was proposed: there
  is no history to import, and the shape of the question assumed one. Kept as a rule anyway, so a
  future dump does not quietly become the truth.
- **Repair the damaged rows during an import.** Rejected: an append-only ledger cannot hold a
  repair honestly, and the audit's own finding was that the last rewrite under live stock is what
  caused the damage (0017).
- **A dedicated opening-balance screen.** Rejected: F-115's stocktake already does everything it
  would do, including the blank-versus-zero distinction and the atomic apply, and a second way to
  set stock is a second way to get it wrong.
