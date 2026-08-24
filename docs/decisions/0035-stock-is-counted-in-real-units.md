# ADR-0035: Stock is counted in real units, not in thousandths of a container

**Status:** Accepted · **Date:** 2026-08-24 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

The bar's original quantity rule was one number for everything: **thousandths of a container**
(`qty_milli`, `depletes_milli`). A sale of a measure recorded a fraction of the bottle it came out
of, and on-hand was a sum of those fractions. [13-bar-design](../13-bar-design.md) §3 justified it
on the grounds that "a 25 ml measure out of a 70 cl bottle is an exact integer".

It is not. 25/700 is 35.714, stored as `36`, so 28 singles take 1008 thousandths and the bottle
goes negative before it is empty. The production catalogue had the same problem in the other
direction: a 125 ml glass of a 75 cl bottle is 166.67, stored as `166`, so six glasses leave 4
thousandths of a bottle that does not exist. Nothing in the system reconciles the difference; it
surfaces as stocktake variance, indistinguishable from a spillage.

The rounding was the smaller problem. The larger one was that **the real sizes were nowhere**. A
70 cl bottle and a 33 cl can were distinguishable only by a ratio somebody worked out on a
calculator and typed in, and the catalogue form asked for it in a field labelled "Thousandths
taken per sale". Adding a bottle of wine and a small glass to the production catalogue was the
first real use of that form, and it was the moment the scheme was found wanting.

Two further things the model could not say, both of which the bar does. A bottle of spirits is
held but never sold whole, yet every product needed a price and appeared on the till unless
hidden. And the size a measure pours is exactly the licensing question the design deferred: 25 or
35 for a spirit, 125/175/250 for wine (§8).

The deciding fact is timing. At the point of this decision the bar had **never traded**: four
products, four prices, and zero rows in `stock_movements`, `stock_deliveries`,
`stock_delivery_lines`, `stocktakes` and `stocktake_lines`. Re-basing the ledger costs nothing
today and costs a data migration over real money from the first night it opens.

## Decision

**A product is counted in its own basis.** `bar_products.container_ml` holds the millilitres in
one container: 700 for a 70 cl bottle. A product without one is counted in whole items, which is
cans, bottled beer and packets of crisps. The stock ledger, par levels and depletion figures are
all in that basis, so `stock_movements.qty` is millilitres or items and never a fraction of
anything.

Three consequences follow directly:

- **A measure says what it pours.** `depletes_qty` is real millilitres of the stock product: a
  single is `25`, a large glass of wine `175`. A product that points at nothing depletes one whole
  container of itself, so a bottled beer carries no figure at all. Arithmetic is exact: 28 singles
  empty a 70 cl bottle, and six 125 ml glasses empty a 75 cl one.
- **`stock_only` is stock you never sell.** It needs no price, and the till never offers it.
- **Everything an operator types stays in containers.** Deliveries, stocktakes and adjustments are
  entered as an invoice and a shelf read them, a part bottle as a decimal, and the app converts
  through `container_ml`. Only the catalogue asks for millilitres, and only where it means one.

**A container size is fixed once anything has moved against the product.** Every movement means
what it means in the size current when it was written, so changing it later re-bases the history
with no trace, exactly the failure [ADR-0031](./0031-a-tab-charge-is-the-only-voidable-transaction.md)
describes for a changed `depletes_milli`. The API refuses the change with a `409` naming the fix:
retire the product and add the new size as its own.

The conversion is lossless because thousandths of a container are exactly millilitres of a 1000 ml
one. Migration `0048` gives every product that already existed `container_ml = 1000`, and every
level, par and ratio keeps the value and the meaning it already had. The real sizes are then an
operator edit, which is safe precisely because nothing has moved yet (`08-operations` §4b).

## Alternatives considered

**Keep thousandths and derive them from a size the form asks for.** The smallest change: the
operator types "700 ml bottle" and "25 ml serve" and the app works out `36`. It fixes the data
entry, which was the original complaint, and nothing else. The rounding stays, and it stays
forever: a bottle runs dry 0.2 shots early, every bottle. Rejected because the ledger is empty
today and will not be again, so the cheap fix is only cheap now.

**Re-base to a finer unit, thousandths of a millilitre.** Exact, and it keeps one unit for
everything. Rejected as precision nobody needs, bought with numbers nobody can read: a delivery of
six bottles would be 4,200,000.

**An explicit basis column (`counted_in: 'ml' | 'each'`) alongside the size.** More legible at a
glance than "null means items". Rejected as derivable state: the size is the fact, the basis is a
reading of it, and two columns that must agree eventually will not.

**Record the size on every movement instead of on the product.** Would make a size change safe
rather than refused. Rejected as the wrong trade: it complicates every sum of on-hand to buy an
operation that should be rare and deliberate, and "retire it and add the new one" is the honest
answer to a bottle that changed size.

## Consequences

- `qty_milli`, `depletes_milli`, `par_milli`, `expected_milli`, `counted_milli` and
  `cost_pence_per_unit` are renamed to `qty`, `depletes_qty`, `par_qty`, `expected_qty`,
  `counted_qty` and `cost_pence_per_container`. The names carry the meaning, so a reader cannot
  half-remember which is which.
- SQLite rewrites trigger bodies through `ALTER TABLE ... RENAME COLUMN`, so the append-only
  triggers on `stock_movements` ([ADR-0027](./0027-the-refusals-register-is-append-only.md)'s
  pattern, migrations `0034` and `0041`) survive the rename naming the new columns, and no
  hand-authored trigger migration is needed. This was verified against a database with rows in it
  before the migration was accepted.
- **The migration is generated in three files, not one, and the reason is a tool bug worth
  knowing.** Drizzle's SQLite table-rebuild emits `INSERT INTO __new_t(...) SELECT ...` naming the
  *new* column list on both sides. When a rebuild coincides with an added column, the SELECT reads
  a column the old table does not have, and SQLite's double-quoted-identifier fallback turns it
  into a **string literal** rather than an error: every row silently gets `'container_ml'` where a
  number should be. Adds (`0045`), renames (`0046`) and the nullability change that forces the
  rebuild (`0047`) are therefore generated separately, so no rebuild ever reads a column that does
  not yet exist. Read the SQL of any bar migration that rebuilds a table.
- GP scales cost by real volume: a 175 ml glass costs 175/750ths of its bottle's latest delivery
  cost. `cost_pence_per_container` is per container, as an invoice quotes it.
- §8's open question on measure sizes is closed: they are catalogue entries in millilitres, and
  what the licence permits is an operator decision rather than a schema one.
- Voids are unaffected. They copy the recorded `SALE` rows rather than recomputing from the
  catalogue (ADR-0031), which is what makes a later change to a recipe or a size safe.
