/**
 * How the bar counts things. A product with a container size is counted in
 * millilitres; one without is counted in whole items (ADR-0035).
 */

/** The shape it comes in, for the shelf and the menu. Not a size. */
export const PRODUCT_UNITS = ['bottle', 'can', 'measure', 'glass', 'each'] as const
export const PRODUCT_STATUSES = ['ACTIVE', 'HIDDEN', 'RETIRED'] as const

export type ProductUnit = (typeof PRODUCT_UNITS)[number]

/** "bottles", "items": what a count of containers is a count of. */
export function unitLabel(unit: string, plural = true) {
  if (unit === 'each') return 'items'
  return plural ? `${unit}s` : unit
}

export interface Countable {
  containerMl?: number | null
}

/** Offered in the catalogue so nobody types 70 cl as 70. */
export const CONTAINER_ML_PRESETS = [250, 330, 440, 500, 568, 700, 750, 1000] as const
/** Singles, doubles, and the three wine measures a licence names. */
export const SERVE_ML_PRESETS = [25, 35, 50, 70, 125, 175, 250] as const

/** Millilitres in one container, or 1 when the product is counted in items. */
export function containerSize(product: Countable) {
  return product.containerMl ?? 1
}

/** Six 70 cl bottles is 4200 ml; twenty-four cans is 24. */
export function containersToQty(product: Countable, containers: number) {
  return Math.round(containers * containerSize(product))
}

/** 1750 ml of a 75 cl bottle is 2.33 bottles. */
export function qtyToContainers(product: Countable, qty: number) {
  return qty / containerSize(product)
}

/** Whole containers read as integers; part containers to two places. */
export function formatContainers(product: Countable, qty: number) {
  const containers = qtyToContainers(product, qty)
  return Number.isInteger(containers) ? String(containers) : containers.toFixed(2)
}

/** The raw level in its own basis: "1750 ml", or "24". */
export function formatQty(product: Countable, qty: number) {
  return product.containerMl == null ? String(qty) : `${qty} ml`
}
