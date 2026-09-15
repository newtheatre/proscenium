# 0017: Bar products sell as serving-size variants

- Status: Accepted (Phase 0 gate, 26 August 2026)
- Date: 2026-08-26

## Context

The bar sells one stocked thing at several sizes: wine by the bottle or as a 125ml, 175ml or
250ml glass; a spirit as a single or double with a mixer choice. The old schema modelled a
product as one price and one depletion, which forced duplicate products per size and
contributed to the container-size data damage the audit documented.

## Decision

A sellable product owns a set of serving-size variants. Each variant carries its own depletion
quantity, expressed against the same stocked item in its real units (millilitres for measured
stock, whole items otherwise). Recipes stay one level deep over stocked ingredients with
choice groups; a choice-group component can be marked included, so a double spirit's price
covers its soft-drink mixer, which still depletes stock at zero charge. The till renders one
product with size buttons; every sale line records the variant, its price and its depletion;
stock arithmetic is unchanged (on-hand is the sum of movements).

Amended 26 August at committee direction: prices resolve **variant first, then category
default**. A category carries optional default prices per serving kind (every soft drink £1;
every spirit £2.50 as a single, £4.00 as a double with its mixer included), and a variant
without its own price row inherits the category default. An explicit variant price always
beats the default; a variant with neither refuses to sell rather than guessing. Category
defaults are dated and append-only exactly like variant prices, and every sale line snapshots
the resolved price and which level supplied it.

Amended 15 September 2026 at Matt's direction, after the bar review found the model sound and the
set-up unusable (a can of cider took four screens and seven submissions, a house red fourteen).
Adding a product is now guided by its **shape**, and a shape is **derived from the product's
variants, never stored**: `productShape` in `shared/utils/bar.ts` reads the variants and answers
SIMPLE (one serving), MEASURED (several sizes off one stocked item) or RECIPE (several
components), or UNSET while a product has no variants yet. No column records it, so a product
edited afterwards cannot contradict the shape it was created under, and set-up creates nothing the
existing screens cannot edit. **Measure presets** (wine 750, 250, 175 and 125; spirits 25 and 50;
draught 568 and 284; packaged at quantity 1) are a constant over the existing serving-kind
vocabulary, sitting beside `SERVING_KINDS`. A preset may not invent a serving kind: it names only
kinds the vocabulary already holds, so a category's default prices (F-121) keep resolving for
every size a preset emits, and adding a size stays what it was before, an addition to one list.

## Consequences

- Variance and gross-profit reporting work per variant and per stocked item.
- The migration maps old duplicate products onto variant sets in a written table; historical
  sales keep their original line identities.
- Container size on a stocked item is immutable once movements exist; correcting it is retire
  and re-add, carried from the old rule that protected the ledger.
- A shape read from variants costs a derivation on every render and owes nothing to a migration;
  the price of that is that shape is a view of the data, so nothing may branch on it at the write
  path beyond validating the form the person filled in (F-127).
