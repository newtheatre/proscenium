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
  qty: number
  kind: (typeof schema.MOVEMENT_KINDS)[number]
  refTable?: string | null
  refId?: string | null
  costPencePerContainer?: number | null
  reason?: string | null
  createdByUserId: string | null
}

export function movementStatements(drafts: MovementDraft[]): BatchItem<'sqlite'>[] {
  return drafts
    .filter(d => d.qty !== 0)
    .map(d => db.insert(schema.stockMovements).values({
      productId: d.productId,
      qty: d.qty,
      kind: d.kind,
      refTable: d.refTable ?? null,
      refId: d.refId ?? null,
      costPencePerContainer: d.costPencePerContainer ?? null,
      reason: d.reason ?? null,
      createdByUserId: d.createdByUserId,
    }) as BatchItem<'sqlite'>)
}

export interface DepletingProduct {
  id: string
  containerMl: number | null
  stockProductId: string | null
  depletesQty: number | null
}

/**
 * What selling `qty` of a product takes off the shelf: a 125 ml glass takes
 * 125 of its bottle's millilitres, anything else a whole container (§3.1).
 */
export function depletion(product: DepletingProduct, qty: number) {
  const perSale = product.stockProductId ? product.depletesQty! : containerSize(product)
  return {
    productId: product.stockProductId ?? product.id,
    qty: -(perSale * qty),
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
    merged.set(d.productId, (merged.get(d.productId) ?? 0) + d.qty)
  }
  return [...merged].map(([productId, qty]) => ({
    productId,
    qty,
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
      onHand: sql<number>`sum(${schema.stockMovements.qty})`.as('on_hand'),
    })
    .from(schema.stockMovements)
    .groupBy(schema.stockMovements.productId)
  return new Map(rows.map(r => [r.productId, Number(r.onHand ?? 0)]))
}

export async function onHandFor(productId: string): Promise<number> {
  const [row] = await db
    .select({ onHand: sql<number>`coalesce(sum(${schema.stockMovements.qty}), 0)` })
    .from(schema.stockMovements)
    .where(eq(schema.stockMovements.productId, productId))
  return Number(row?.onHand ?? 0)
}

/** Whether anything has ever moved: a container size may not change after it has. */
export async function hasMovements(productId: string): Promise<boolean> {
  const row = await db.select({ id: schema.stockMovements.id })
    .from(schema.stockMovements)
    .where(eq(schema.stockMovements.productId, productId))
    .limit(1).get()
  return row != null
}

/**
 * Latest delivery cost per product, which is what stock is valued at. One
 * grouped pass, then a lookup, rather than a query per product.
 */
export async function latestCostByProduct(): Promise<Map<string, number>> {
  const rows = await db
    .select({
      productId: schema.stockDeliveryLines.productId,
      cost: schema.stockDeliveryLines.costPencePerContainer,
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
    columns: {
      id: true,
      name: true,
      unit: true,
      containerMl: true,
      stockOnly: true,
      stockProductId: true,
      depletesQty: true,
      parQty: true,
      status: true,
      categoryId: true,
    },
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
    columns: { id: true, containerMl: true, stockProductId: true, depletesQty: true },
  })
  // A measure with no size cannot be resolved, so it is absent and fails before the money.
  return new Map(rows.filter(r => !r.stockProductId || r.depletesQty != null).map(r => [r.id, r]))
}
