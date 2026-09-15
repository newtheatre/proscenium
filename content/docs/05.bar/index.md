---
title: Bar
description: The catalogue the till sells from, the stock register behind it, and the reports read from the ledger.
module: Bar
updatedOn: 2026-09-15
updatedBy: Matt Adcock
navigation:
  title: Overview
  icon: i-lucide-beer
---

The bar screens are the standing configuration behind the till and the record of what the bar
holds. Nothing here is operational: the till itself, where money is taken on the Students'
Union's SumUp reader, is a show-night screen and has its own page at
[The till](/docs/show-night/the-till). What is set up here is what the till draws its buttons
from, what a sale depletes, and what the treasurer reads at the end of a period.

The screens are under **Manage, Bar** in the account menu. Reading them needs the `bar.read`
permission and changing anything needs `bar.write`; the Bar manager role holds both, and
administrators hold everything. Reports are the one exception: they open for `finance.read` too,
so the Treasurer reads them without seeing the catalogue or the stock. Nobody reaches any of this
from a shift: a bar shift opens the till, not these screens.

::card-group
  ::card{icon="i-lucide-beer" title="Products" to="/docs/bar/products"}
  What the till sells, its serving sizes, what each size depletes and what it costs.
  ::
  ::card{icon="i-lucide-layout-grid" title="Categories" to="/docs/bar/categories"}
  The groups the till shows, in the order it shows them, with default prices by serving kind.
  ::
  ::card{icon="i-lucide-percent" title="Discounts" to="/docs/bar/discounts"}
  Percentage discounts the till can offer, capped by configuration and snapshotted onto each sale.
  ::
  ::card{icon="i-lucide-package" title="Stock" to="/docs/bar/stock"}
  The register of stocked items, what is on hand, and recording a delivery or wastage.
  ::
  ::card{icon="i-lucide-arrow-left-right" title="Movements" to="/docs/bar/movements"}
  The append-only history every on-hand figure is added up from, and how a mistake is reversed.
  ::
  ::card{icon="i-lucide-clipboard-list" title="Stocktakes" to="/docs/bar/stocktakes"}
  Counting the bar against what the register expects, and applying the variance.
  ::
  ::card{icon="i-lucide-truck" title="Order list" to="/docs/bar/order-list"}
  What is short against its par level, grouped for a supplier and exported as CSV.
  ::
  ::card{icon="i-lucide-bar-chart-3" title="Reports" to="/docs/bar/reports"}
  Sales, gross profit, stocktake variance, comps and discounts over a period, with CSV export.
  ::
  ::card{icon="i-lucide-receipt" title="Tabs" to="/docs/bar/tabs"}
  Every holder still carrying a balance, itemised, and voiding a charge behind a reason.
  ::
::

## How the pieces fit

A **stocked item** is what the bar counts: a bottle of gin in millilitres, a can of lager as
whole items. A **product** is what the till shows, sitting in a **category** that decides where
its button appears. A product sells at one or more **serving sizes**, and each size says what
pouring it depletes, in the stocked item's own units, and carries its own dated price. A sale on
the till writes the money to the ledger and one stock movement per ingredient, so on hand is
always the sum of the movements and never a figure anybody typed in.

## Related pages

- [The till](/docs/show-night/the-till)
- [Age checks](/docs/show-night/age-checks)
- [Comps and discounts](/docs/money/comps-and-discounts)
