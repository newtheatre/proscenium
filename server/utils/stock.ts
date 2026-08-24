import { db, schema } from '@nuxthub/db'
import type { BatchItem } from 'drizzle-orm/batch'
import { desc, eq, sql } from 'drizzle-orm'
import type { LineChoice } from '~~/server/db/schema/transactions'

/**
 * The one writer of the stock ledger (docs/13 §3.2). Nothing else inserts into
 * `stock_movements`, and `on_hand` is derived here, never stored.
 */

/** One INSERT per movement, so no statement's parameters grow with the rows (ADR-0006). */
export interface MovementDraft {
  /** Must already be the stock product: use `resolveLine()` to resolve a sale. */
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

export interface RecipeIngredient {
  id: string
  componentProductId: string | null
  choiceCategoryId: string | null
  qty: number
}

export interface CatalogueProduct {
  id: string
  categoryId: string
  containerMl: number | null
  stockOnly: boolean
  status: (typeof schema.PRODUCT_STATUSES)[number]
  /** Empty means it holds its own stock, so a sale takes one whole container. */
  recipe: RecipeIngredient[]
}

/** One sale's worth of each thing it takes off the shelf, choices resolved. */
export interface ResolvedLine {
  productId: string
  qty: number
  choices: LineChoice[]
  ingredients: { productId: string, qty: number }[]
}

type Resolution = { ok: true, line: ResolvedLine } | { ok: false, error: string }

/** Something a movement may be written against: it holds stock itself. */
export function isStockProduct(product: Pick<CatalogueProduct, 'recipe'>) {
  return product.recipe.length === 0
}

/** What a choice slot may offer: stock, on sale, and in the named category. */
export function choicePool(categoryId: string, catalogue: Map<string, CatalogueProduct>) {
  return [...catalogue.values()]
    .filter(p => p.categoryId === categoryId && p.status === 'ACTIVE' && isStockProduct(p))
}

/**
 * What selling `qty` of a product takes off the shelf. A product with no
 * recipe takes one whole container of itself (docs/13 §3.1, ADR-0036).
 */
export function resolveLine(
  product: CatalogueProduct,
  qty: number,
  choices: LineChoice[],
  catalogue: Map<string, CatalogueProduct>,
): Resolution {
  if (isStockProduct(product)) {
    return { ok: true, line: { productId: product.id, qty, choices: [], ingredients: [{ productId: product.id, qty: containerSize(product) }] } }
  }

  const ingredients: { productId: string, qty: number }[] = []
  const picked: LineChoice[] = []

  for (const item of product.recipe) {
    if (item.componentProductId) {
      const component = catalogue.get(item.componentProductId)
      if (!component || !isStockProduct(component)) {
        return { ok: false, error: 'One of its ingredients is no longer stocked. Reload the till.' }
      }
      ingredients.push({ productId: component.id, qty: item.qty })
      continue
    }

    const pool = choicePool(item.choiceCategoryId!, catalogue)
    // A pool counted two ways makes the recipe's figure mean two things (ADR-0036).
    if (pool.some(p => (p.containerMl == null) !== (pool[0]!.containerMl == null))) {
      return { ok: false, error: 'Its options are not all counted the same way. Fix the catalogue before selling it.' }
    }
    const chosen = pool.find(p => p.id === choices.find(c => c.itemId === item.id)?.productId)
    if (!chosen) return { ok: false, error: 'Choose what goes in it before ringing it up.' }

    ingredients.push({ productId: chosen.id, qty: item.qty })
    picked.push({ itemId: item.id, productId: chosen.id })
  }

  return { ok: true, line: { productId: product.id, qty, choices: picked, ingredients } }
}

/** Sale or comp movements for a basket. Comps deplete exactly as sales do. */
export function basketMovements(
  lines: ResolvedLine[],
  opts: { kind: 'SALE' | 'COMP', refTable: string, refId: string, createdByUserId: string | null },
): MovementDraft[] {
  const merged = new Map<string, number>()
  for (const line of lines) {
    for (const ingredient of line.ingredients) {
      merged.set(ingredient.productId, (merged.get(ingredient.productId) ?? 0) - ingredient.qty * line.qty)
    }
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

/**
 * The whole catalogue with its recipes, unparameterised: a bar menu is tens of
 * rows, and an id list here would grow with the basket (ADR-0006).
 */
export async function depletionRules(): Promise<Map<string, CatalogueProduct>> {
  const [products, items] = await Promise.all([
    db.select({
      id: schema.barProducts.id,
      categoryId: schema.barProducts.categoryId,
      containerMl: schema.barProducts.containerMl,
      stockOnly: schema.barProducts.stockOnly,
      status: schema.barProducts.status,
    }).from(schema.barProducts),
    db.select({
      id: schema.barRecipeItems.id,
      productId: schema.barRecipeItems.productId,
      componentProductId: schema.barRecipeItems.componentProductId,
      choiceCategoryId: schema.barRecipeItems.choiceCategoryId,
      qty: schema.barRecipeItems.qty,
      sort: schema.barRecipeItems.sort,
    }).from(schema.barRecipeItems).orderBy(schema.barRecipeItems.sort),
  ])

  const catalogue = new Map<string, CatalogueProduct>(
    products.map(p => [p.id, { ...p, recipe: [] as RecipeIngredient[] }]),
  )
  for (const item of items) catalogue.get(item.productId)?.recipe.push(item)
  return catalogue
}

/** Products a movement may be written against: stock products, not measures. */
export async function stockProducts() {
  const [rows, catalogue] = await Promise.all([
    db.query.barProducts.findMany({
      columns: {
        id: true,
        name: true,
        unit: true,
        containerMl: true,
        stockOnly: true,
        parQty: true,
        status: true,
        categoryId: true,
      },
    }),
    depletionRules(),
  ])
  return rows.filter(r => isStockProduct(catalogue.get(r.id) ?? { recipe: [] }))
}
