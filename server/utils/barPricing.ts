import { db, schema } from '@nuxthub/db'
import { and, desc, eq, inArray, lte } from 'drizzle-orm'

/**
 * Bar prices are date-effective and append-only: the current price is a query,
 * never a column, so a change never rewrites history (docs/13 §3).
 */

export interface CurrentPrice {
  pricePence: number
  priceId: string
}

/** Today in Europe/London, which is the day a price takes effect on. */
export function pricingDate(now: Date = new Date()): string {
  return showNightDate(new Date(now.getTime() + 4 * 60 * 60 * 1000))
}

/** The latest price effective on or before `on`. Null when never priced. */
export async function currentPrice(productId: string, on: string = pricingDate()): Promise<CurrentPrice | null> {
  const row = await db.select({ id: schema.barPrices.id, pricePence: schema.barPrices.pricePence })
    .from(schema.barPrices)
    .where(and(
      eq(schema.barPrices.productId, productId),
      lte(schema.barPrices.effectiveFrom, on),
    ))
    .orderBy(desc(schema.barPrices.effectiveFrom))
    .limit(1)
    .get()

  return row ? { pricePence: row.pricePence, priceId: row.id } : null
}

/**
 * Current prices for a set of products in one query. The id list comes from
 * the catalogue, which is small and bounded, not from a result set (ADR-0006).
 */
export async function currentPrices(productIds: string[], on: string = pricingDate()): Promise<Map<string, CurrentPrice>> {
  if (!productIds.length) return new Map()

  const rows = await db.select({
    id: schema.barPrices.id,
    productId: schema.barPrices.productId,
    pricePence: schema.barPrices.pricePence,
    effectiveFrom: schema.barPrices.effectiveFrom,
  })
    .from(schema.barPrices)
    .where(and(
      inArray(schema.barPrices.productId, productIds),
      lte(schema.barPrices.effectiveFrom, on),
    ))
    .orderBy(desc(schema.barPrices.effectiveFrom))

  const latest = new Map<string, CurrentPrice>()
  // Ordered newest first, so the first sighting of a product is its price.
  for (const row of rows) {
    if (!latest.has(row.productId)) latest.set(row.productId, { pricePence: row.pricePence, priceId: row.id })
  }
  return latest
}

/**
 * The discount in pence off a bar subtotal. Rounded half up, once, so two
 * lines never round differently from the total (docs/13 §4.1.1).
 */
export function applyDiscount(barSubtotalPence: number, percent: number | null | undefined): number {
  if (!percent || percent <= 0) return 0
  return Math.floor((barSubtotalPence * Math.min(percent, 100)) / 100 + 0.5)
}
