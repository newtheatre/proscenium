# ADR-0036: A sold product is a recipe over the things we stock

**Status:** Accepted · **Date:** 2026-08-24 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

[ADR-0035](./0035-stock-is-counted-in-real-units.md) fixed what a measure pours. It did not change
**how many things** a sale could pour: a product carried one `stock_product_id` and one figure, so
it could deplete exactly one other product.

That is not what the bar sells. Spirits are held as bottles and sold three ways: a single, a
double, and a spirit with a soft drink as a mixer. The third has two ingredients, so it could not
be one button; staff had to ring the gin and the tonic as separate lines, which means the
customer-facing price of a gin and tonic was two numbers and the till could not tell a mixed drink
from two unrelated items. Cocktails, with three or more ingredients at set measures, were simply
not expressible.

The mixer is also not a fixed thing. A gin and tonic, a gin and lemonade and a gin and ginger ale
are the same drink at the same price, and enumerating each as its own product multiplies the menu
by the number of soft drinks on the shelf, then again by every spirit. What the bar actually does
is pick the spirit and then pick whatever mixer is applicable, at the point of sale.

[13-bar-design](../13-bar-design.md) §3.1 anticipated some of this: "a meal deal is a product
whose sale handler writes several movements: implement as a small `bar_bundle_items` table if the
committee wants deals in v1, otherwise defer." §8 deferred it. The bar asking for gin and tonic on
one button is that question arriving.

## Decision

**What a sold product is made of is a recipe**, `bar_recipe_items`, one row per ingredient. **No
rows means the product holds its own stock**, so a bottled beer, a can and a packet of crisps carry
no recipe at all and a sale takes one whole container of themselves. `stock_product_id` and
`depletes_qty` are gone: a measure is a one-ingredient recipe, which is the same rule said once
instead of twice.

**An ingredient is either one product or a choice from one category.** A fixed ingredient names a
`component_product_id`; a choice names a `choice_category_id` and the till asks which one when the
product is tapped. Exactly one of the two is set. `qty` is in the ingredient's own basis, so 25
means 25 ml of a bottle and 1 means one can.

| Sold as | Recipe |
| --- | --- |
| Gin, single | 25 ml of the gin bottle |
| Gin and mixer | 25 ml of the gin bottle, plus one from Mixers |
| Espresso martini | 50 ml vodka, 25 ml coffee liqueur, 25 ml espresso |

Four rules keep it honest, and each is refused with a message naming the rule:

- **One level.** An ingredient must itself hold stock. A recipe of recipes is refused, and so is
  adding a recipe to something another product is already made from.
- **A choice pool is counted one way.** A category mixing millilitre-counted and item-counted
  products would make a single `qty` mean two things, so it is refused when the recipe is saved
  and again when a sale tries to use it.
- **The price is on the sold product, not on what is picked.** A pool should be things you charge
  the same for. Per-choice surcharges are deliberately not built; add them when somebody wants to
  charge more for a premium tonic, not before.
- **Choices are checked, never trusted.** The server resolves every pick against the catalogue it
  has already loaded, in memory rather than with an id list (ADR-0006), and refuses a missing or
  out-of-pool pick **before any money is recorded**. What lands in `transaction_lines.choices` is
  what the catalogue accepted, not what the client sent.

`transaction_lines.choices` exists because stock movements are merged per stock product across the
whole transaction, so which mixer went into which drink is not recoverable from the ledger. It is
what lets a receipt and a comp queue say *Gin and mixer (Fever-Tree tonic)*.

## Alternatives considered

**A fixed mixer field on the product.** One nullable `mixer_product_id` alongside the existing
pointer: the smallest change that makes a gin and tonic one button. Rejected because it hard-wires
one mixer per product, which is the multiplication problem again, and it does nothing for
cocktails.

**Explicit choice groups, a table of pools with their members.** More precise than a category: a
product could sit in several pools, and reorganising the menu would not disturb a recipe. Rejected
for v1 as a second thing to maintain for a bar with one pool. A category is already managed on the
catalogue screen, and mixers being their own category is good catalogue hygiene anyway. If a pool
ever needs to cut across categories, this is the change to make, and the recipe row already points
at a pool rather than at a list.

**Enumerate every combination as its own product.** No schema change at all. Rejected: gin and
tonic, gin and lemonade and gin and ginger ale are one drink at one price, and the menu would grow
as spirits times mixers while the till showed a wall of near-identical tiles.

**Let the recipe reference other recipes.** Would allow a "round" of drinks. Rejected as the
bundle-of-bundles the original design already refused: depth makes every depletion a graph walk
and every error message ambiguous, to buy something nobody has asked for.

## Consequences

- Adding a recipe to a product clears its container size, because something made of other things
  holds no stock of its own. Migration `0050` does the same for the measures it converts.
- GP sums the ingredients, and **a choice slot is costed at its dearest option** so the figure is
  never flattered by assuming the cheap mixer.
- The till, the self-serve tab and the training mirror all send `slots` per product and
  `choiceOptions` once per menu, rather than repeating a pool on every product that uses it.
- A basket line is keyed by product *and* picks, so a gin and tonic and a gin and lemonade are two
  lines rather than one line of two.
- Voids are still copied from the recorded `SALE` rows rather than recomputed (ADR-0031), which is
  what makes editing a recipe afterwards safe.
- Deals and bundles need no further work: a "Deals" category is products with recipes, so §8's
  open question is answered rather than deferred again.
