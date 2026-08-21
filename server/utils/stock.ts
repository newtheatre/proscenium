import { db, schema } from '@nuxthub/db'
import type { BatchItem } from 'drizzle-orm/batch'
import { desc, eq, sql } from 'drizzle-orm'

/**
 * The one writer of the stock ledger (docs/13 §3.2). Nothing else inserts into
 * `stock_movements`, and `on_hand` is derived here, never stored.
 */

/** One INSERT per movement, so no statement's parameters grow with the rows (ADR-0006). */
export interface MovementDraft {
  /** Must already be the stock product: use `depletion()` to resolve a sale. */
  productId: string
  qtyMilli: number
  kind: (typeof schema.MOVEMENT_KINDS)[number]
  refTable?: string | null
  refId?: string | null
  costPencePerUnit?: number | null
  reason?: string | null
  createdByUserId: string | null
}

export function movementStatements(drafts: MovementDraft[]): BatchItem<'sqlite'>[] {
  return drafts
    .filter(d => d.qtyMilli !== 0)
    .map(d => db.insert(schema.stockMovements).values({
      productId: d.productId,
      qtyMilli: d.qtyMilli,
      kind: d.kind,
      refTable: d.refTable ?? null,
      refId: d.refId ?? null,
      costPencePerUnit: d.costPencePerUnit ?? null,
      reason: d.reason ?? null,
      createdByUserId: d.createdByUserId,
    }) as BatchItem<'sqlite'>)
}

export interface DepletingProduct {
  id: string
  stockProductId: string | null
  depletesMilli: number
}

/**
 * What selling `qty` of a product takes off the shelf. A 175ml glass of a
 * 750ml bottle is 233 milli of the *bottle* (docs/13 §3.1).
 */
export function depletion(product: DepletingProduct, qty: number) {
  return {
    productId: product.stockProductId ?? product.id,
    qtyMilli: -(product.depletesMilli * qty),
  }
}

/** Sale or comp movements for a basket. Comps deplete exactly as sales do. */
export function basketMovements(
  items: { product: DepletingProduct, qty: number }[],
  opts: { kind: 'SALE' | 'COMP', refTable: string, refId: string, createdByUserId: string | null },
): MovementDraft[] {
  const merged = new Map<string, number>()
  for (const { product, qty } of items) {
    const d = depletion(product, qty)
    merged.set(d.productId, (merged.get(d.productId) ?? 0) + d.qtyMilli)
  }
  return [...merged].map(([productId, qtyMilli]) => ({
    productId,
    qtyMilli,
    kind: opts.kind,
    refTable: opts.refTable,
    refId: opts.refId,
    createdByUserId: opts.createdByUserId,
  }))
}

/**
 * On-hand for every stock product. Grouped in SQL over the whole table, so the
 * parameter count does not grow with the catalogue (ADR-0006).
 */
export async function onHandByProduct(): Promise<Map<string, number>> {
  const rows = await db
    .select({
      productId: schema.stockMovements.productId,
      onHand: sql<number>`sum(${schema.stockMovements.qtyMilli})`.as('on_hand'),
    })
    .from(schema.stockMovements)
    .groupBy(schema.stockMovements.productId)
  return new Map(rows.map(r => [r.productId, Number(r.onHand ?? 0)]))
}

export async function onHandFor(productId: string): Promise<number> {
  const [row] = await db
    .select({ onHand: sql<number>`coalesce(sum(${schema.stockMovements.qtyMilli}), 0)` })
    .from(schema.stockMovements)
    .where(eq(schema.stockMovements.productId, productId))
  return Number(row?.onHand ?? 0)
}

/**
 * Latest delivery cost per product, which is what stock is valued at. One
 * grouped pass, then a lookup, rather than a query per product.
 */
export async function latestCostByProduct(): Promise<Map<string, number>> {
  const rows = await db
    .select({
      productId: schema.stockDeliveryLines.productId,
      cost: schema.stockDeliveryLines.costPencePerUnit,
      deliveredOn: schema.stockDeliveries.deliveredOn,
    })
    .from(schema.stockDeliveryLines)
    .innerJoin(schema.stockDeliveries, eq(schema.stockDeliveries.id, schema.stockDeliveryLines.deliveryId))
    .orderBy(desc(schema.stockDeliveries.deliveredOn), desc(schema.stockDeliveries.createdAt))
  const out = new Map<string, number>()
  for (const r of rows) {
    if (r.cost != null && !out.has(r.productId)) out.set(r.productId, r.cost)
  }
  return out
}

/** Products a movement may be written against: stock products, not measures. */
export async function stockProducts() {
  const all = await db.query.barProducts.findMany({
    columns: { id: true, name: true, unit: true, stockProductId: true, depletesMilli: true, parMilli: true, status: true, categoryId: true },
  })
  const depletedIds = new Set(all.map(p => p.stockProductId).filter(Boolean) as string[])
  return all.filter(p => !p.stockProductId || depletedIds.has(p.id))
}

/**
 * Depletion rules for the whole catalogue, unparameterised: a bar menu is tens
 * of rows, and an id list here would grow with the basket (ADR-0006).
 */
export async function depletionRules(): Promise<Map<string, DepletingProduct>> {
  const rows = await db.query.barProducts.findMany({
    columns: { id: true, stockProductId: true, depletesMilli: true },
  })
  return new Map(rows.map(r => [r.id, r]))
}
