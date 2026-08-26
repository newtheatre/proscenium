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

## Consequences

- Variance and gross-profit reporting work per variant and per stocked item.
- The migration maps old duplicate products onto variant sets in a written table; historical
  sales keep their original line identities.
- Container size on a stocked item is immutable once movements exist; correcting it is retire
  and re-add, carried from the old rule that protected the ledger.
