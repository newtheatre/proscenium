---
title: Bar
description: The till, the catalogue and the stock register.
module: Bar
updatedOn: 2026-09-10
updatedBy: The seed and tooling stream
---

## The till

`/tonight/till` opens without a bar shift for the bar manager, and with one for anyone else
(0044). A sale sends the basket's expected total, in pence, and a mismatch refuses quoting both
figures, the same discipline the box office desk uses. Tender is CARD or COMP; the theatre takes
no cash.

An age-restricted line may carry a Challenge 25 outcome; a tab holder may be charged instead of
the reader, capped by `BAR_TAB_CAP_PENCE` unless a manager overrides it.

## The catalogue

`/bar/categories` and `/bar/products` are the standing configuration: categories, products and
their serving-size variants, gated on `bar.write`. Nothing here is operational.

## Stock

`/bar/stock` is the register: what is held, `/bar/stock/movements` its history and
`/bar/stock/order-list` a suggested reorder from what has sold. `/bar/stock/stocktakes` records a
count against what the register expects; a variance neither hides nor auto-corrects, it is
recorded and applied by a deliberate action.

## Reports

`/bar/reports` covers sales, gross profit, variance, comps and discounts over a night, a week, a
season or a custom range, queried fresh from the ledger and the movement history every time:
nothing here is a stored total that could drift from what actually happened.
