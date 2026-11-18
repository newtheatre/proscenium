// Stock with full recipes (Bar specification, tab 2 "Stock" and tab 10, approved 17 November). Stock
// items are counted in whole base units at stock locations; a level is a cache of its movements, kept
// by a trigger. A size's recipe is fixed items and choice slots; when a sale is paid each line moves
// stock from its outlet's location, keyed by sale line and recipe line, so a replayed batch moves it
// once. Stock never blocks a sale, and the recipe current at payment is the one used.
import { z } from 'zod'
import { all, first, newId, nowMs, refuse, useSetting, type UnitView } from '#kit'
import { BASE_UNITS } from './db/schema'

export type BaseUnit = typeof BASE_UNITS[number]

const id = z.string().min(1).max(64) // not-policy: an id's length
const name = z.string().trim().min(1).max(80) // not-policy: a name's bounds
const units = z.number().int().min(1).max(10_000_000) // not-policy: a bound on a typed quantity (10 kl, 10 t)
const MAX_RECIPE_LINES = 12 // not-policy: more ingredients than any jug has, inside a unit's statement cap

export const stockItemInput = z.object({
  name,
  categoryId: id.nullable().optional(),
  baseUnit: z.enum(BASE_UNITS),
  packSize: units,
  packName: z.string().trim().min(1).max(40), // not-policy: a pack name's bound
  countUnitSize: units,
  costMinor: z.number().int().min(0).max(10_000_000).nullable().optional(), // not-policy: a bound on a typed cost
  reorderLevel: z.number().int().min(0).max(10_000_000).nullable().optional(), // not-policy: a bound on a typed quantity
  fullWeightG: units.nullable().optional(),
  emptyWeightG: z.number().int().min(0).max(10_000_000).nullable().optional(), // not-policy: a bound on a typed weight
}).strict()
  .refine(v => (v.fullWeightG == null) === (v.emptyWeightG == null), { message: 'Give both weights, or neither.', path: ['emptyWeightG'] })
  .refine(v => v.fullWeightG == null || v.fullWeightG > v.emptyWeightG!, { message: 'A full one weighs more than an empty one.', path: ['fullWeightG'] })
export type StockItemInput = z.infer<typeof stockItemInput>
export const stockItemPatch = z.object({
  name,
  categoryId: id.nullable(),
  baseUnit: z.enum(BASE_UNITS),
  packSize: units,
  packName: z.string().trim().min(1).max(40), // not-policy: a pack name's bound
  countUnitSize: units,
  costMinor: z.number().int().min(0).max(10_000_000).nullable(), // not-policy: a bound on a typed cost
  reorderLevel: z.number().int().min(0).max(10_000_000).nullable(), // not-policy: a bound on a typed quantity
  fullWeightG: units.nullable(),
  emptyWeightG: z.number().int().min(0).max(10_000_000).nullable(), // not-policy: a bound on a typed weight
  active: z.boolean(),
}).partial().strict()
export type StockItemPatch = z.infer<typeof stockItemPatch>

export const locationInput = z.object({ name, spaceId: id.nullable().optional(), venueId: id.nullable().optional() }).strict()
export const locationPatch = z.object({ name, spaceId: id.nullable(), venueId: id.nullable(), active: z.boolean() }).partial().strict()
export type LocationInput = z.infer<typeof locationInput>
export type LocationPatch = z.infer<typeof locationPatch>

const recipeLine = z.union([
  z.object({ stockItemId: id, quantity: units }).strict(),
  z.object({ choiceGroupId: id, quantity: units }).strict(),
])
export const recipeInput = z.object({ lines: z.array(recipeLine).max(MAX_RECIPE_LINES) }).strict()
  .refine(v => new Set(v.lines.map(l => 'stockItemId' in l ? `i:${l.stockItemId}` : `g:${l.choiceGroupId}`)).size === v.lines.length, { message: 'Each ingredient once.', path: ['lines'] })
export type RecipeInput = z.infer<typeof recipeInput>

export interface StockItem {
  id: string
  name: string
  categoryId: string | null
  baseUnit: BaseUnit
  packSize: number
  packName: string
  countUnitSize: number
  costMinor: number | null
  reorderLevel: number | null
  fullWeightG: number | null
  emptyWeightG: number | null
  active: boolean
  // Base units at each location that has held it, and in all.
  levels: { locationId: string, quantity: number }[]
  total: number
  low: boolean
}
export interface StockLocation { id: string, name: string, spaceId: string | null, venueId: string | null, active: boolean }
export interface RecipeLine { id: string, stockItemId: string | null, choiceGroupId: string | null, quantity: number }

const GONE = (what: string) => ({ code: `bar.${what}.unknown`, reason: `There is no such ${what.replace('-', ' ')}.` })

export async function stock(): Promise<{ items: StockItem[], locations: StockLocation[], currency: string }> {
  const items = await all<{ id: string, name: string, category_id: string | null, base_unit: BaseUnit, pack_size: number, pack_name: string, count_unit_size: number, cost_minor: number | null, reorder_level: number | null, full_weight_g: number | null, empty_weight_g: number | null, active: number }>(
    'SELECT id, name, category_id, base_unit, pack_size, pack_name, count_unit_size, cost_minor, reorder_level, full_weight_g, empty_weight_g, active FROM bar_stock_items ORDER BY active DESC, lower(name), id',
  )
  const levels = new Map<string, { locationId: string, quantity: number }[]>()
  for (const l of await all<{ stock_item_id: string, location_id: string, quantity: number }>('SELECT stock_item_id, location_id, quantity FROM bar_stock_levels ORDER BY stock_item_id, location_id')) {
    levels.set(l.stock_item_id, [...levels.get(l.stock_item_id) ?? [], { locationId: l.location_id, quantity: l.quantity }])
  }
  const locations = await all<{ id: string, name: string, space_id: string | null, venue_id: string | null, active: number }>(
    'SELECT id, name, space_id, venue_id, active FROM bar_stock_locations ORDER BY active DESC, lower(name), id',
  )
  return {
    items: items.map((r) => {
      const at = levels.get(r.id) ?? []
      const total = at.reduce((sum, l) => sum + l.quantity, 0)
      return {
        id: r.id, name: r.name, categoryId: r.category_id, baseUnit: r.base_unit, packSize: r.pack_size, packName: r.pack_name, countUnitSize: r.count_unit_size,
        costMinor: r.cost_minor, reorderLevel: r.reorder_level, fullWeightG: r.full_weight_g, emptyWeightG: r.empty_weight_g, active: !!r.active,
        levels: at, total, low: r.reorder_level !== null && total < r.reorder_level,
      }
    }),
    locations: locations.map(l => ({ id: l.id, name: l.name, spaceId: l.space_id, venueId: l.venue_id, active: !!l.active })),
    currency: await useSetting('core.locale.currency') as string,
  }
}

const ITEM_REFUSED = { code: 'bar.stock-item.refused', reason: 'Another stock item has that name, or its category is not in use.', remedy: 'Check the name and the category.' }

export async function addStockItem(unit: UnitView, input: StockItemInput): Promise<string> {
  const itemId = newId('bsti')
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO bar_stock_items (id, name, category_id, base_unit, pack_size, pack_name, count_unit_size, cost_minor, currency, reorder_level, full_weight_g, empty_weight_g, active, created_at, updated_at)
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?
          WHERE NOT EXISTS (SELECT 1 FROM bar_stock_items WHERE lower(name) = lower(?))
          AND (? IS NULL OR EXISTS (SELECT 1 FROM bar_categories WHERE id = ? AND active = 1))`,
    params: [
      itemId, input.name, input.categoryId ?? null, input.baseUnit, input.packSize, input.packName, input.countUnitSize, input.costMinor ?? null,
      await useSetting('core.locale.currency') as string, input.reorderLevel ?? null, input.fullWeightG ?? null, input.emptyWeightG ?? null, at, at,
      input.name, input.categoryId ?? null, input.categoryId ?? null,
    ],
  }).expect(1, ITEM_REFUSED)
  unit.audit({ action: 'create', record: ['bar.stock-item', itemId] })
  return itemId
}

/** Changes a stock item. Its base unit is fixed once it has moved; a retired item leaves every recipe and option. */
export async function updateStockItem(unit: UnitView, itemId: string, input: StockItemPatch): Promise<void> {
  const row = await first<{ name: string, category_id: string | null, base_unit: BaseUnit, pack_size: number, pack_name: string, count_unit_size: number, cost_minor: number | null, reorder_level: number | null, full_weight_g: number | null, empty_weight_g: number | null, active: number }>(
    'SELECT name, category_id, base_unit, pack_size, pack_name, count_unit_size, cost_minor, reorder_level, full_weight_g, empty_weight_g, active FROM bar_stock_items WHERE id = ?', itemId,
  )
  if (!row) refuse(GONE('stock-item').code, GONE('stock-item').reason, { status: 404 })
  const v = {
    name: input.name ?? row!.name,
    categoryId: input.categoryId === undefined ? row!.category_id : input.categoryId,
    baseUnit: input.baseUnit ?? row!.base_unit,
    packSize: input.packSize ?? row!.pack_size,
    packName: input.packName ?? row!.pack_name,
    countUnitSize: input.countUnitSize ?? row!.count_unit_size,
    costMinor: input.costMinor === undefined ? row!.cost_minor : input.costMinor,
    reorderLevel: input.reorderLevel === undefined ? row!.reorder_level : input.reorderLevel,
    fullWeightG: input.fullWeightG === undefined ? row!.full_weight_g : input.fullWeightG,
    emptyWeightG: input.emptyWeightG === undefined ? row!.empty_weight_g : input.emptyWeightG,
    active: input.active === undefined ? !!row!.active : input.active,
  }
  if ((v.fullWeightG === null) !== (v.emptyWeightG === null) || (v.fullWeightG !== null && v.fullWeightG <= v.emptyWeightG!))
    refuse('bar.stock-item.weights', 'Give a full weight above the empty weight, or neither.', { status: 422 })
  const at = nowMs()
  unit.add({
    sql: `UPDATE bar_stock_items SET name = ?, category_id = ?, base_unit = ?, pack_size = ?, pack_name = ?, count_unit_size = ?, cost_minor = ?, reorder_level = ?, full_weight_g = ?, empty_weight_g = ?, active = ?, updated_at = ?
          WHERE id = ? AND NOT EXISTS (SELECT 1 FROM bar_stock_items WHERE id <> ? AND lower(name) = lower(?))
          AND (? IS NULL OR ? IS ? OR EXISTS (SELECT 1 FROM bar_categories WHERE id = ? AND active = 1))
          AND (base_unit = ? OR NOT EXISTS (SELECT 1 FROM bar_stock_movements WHERE stock_item_id = ?))`,
    params: [
      v.name, v.categoryId, v.baseUnit, v.packSize, v.packName, v.countUnitSize, v.costMinor, v.reorderLevel, v.fullWeightG, v.emptyWeightG, v.active ? 1 : 0, at,
      itemId, itemId, v.name, v.categoryId, v.categoryId, row!.category_id, v.categoryId, v.baseUnit, itemId,
    ],
  }).expect(1, { code: 'bar.stock-item.refused', reason: 'Another stock item has that name, its category is not in use, or it has moved and so keeps its unit.', remedy: 'Check the name, the category and the unit.' })
  if (!v.active && row!.active) {
    unit.add({ sql: 'DELETE FROM bar_recipe_lines WHERE stock_item_id = ?', params: [itemId] })
    unit.add({ sql: 'UPDATE bar_choice_options SET stock_item_id = NULL, updated_at = ? WHERE stock_item_id = ?', params: [at, itemId] })
  }
  unit.audit({ action: 'update', record: ['bar.stock-item', itemId], ...(v.active === !!row!.active ? {} : { detail: { active: v.active } }) })
}

const LOCATION_REFUSED = { code: 'bar.stock-location.refused', reason: 'Another location in use has that name, or its space or venue does not exist.', remedy: 'Check the name, the space and the venue.' }

export function addLocation(unit: UnitView, input: LocationInput): string {
  const locationId = newId('bstl')
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO bar_stock_locations (id, name, space_id, venue_id, active, created_at, updated_at)
          SELECT ?, ?, ?, ?, 1, ?, ? WHERE NOT EXISTS (SELECT 1 FROM bar_stock_locations WHERE active = 1 AND lower(name) = lower(?))
          AND (? IS NULL OR EXISTS (SELECT 1 FROM core_spaces WHERE id = ?)) AND (? IS NULL OR EXISTS (SELECT 1 FROM core_venues WHERE id = ?))`,
    params: [locationId, input.name, input.spaceId ?? null, input.venueId ?? null, at, at, input.name, input.spaceId ?? null, input.spaceId ?? null, input.venueId ?? null, input.venueId ?? null],
  }).expect(1, LOCATION_REFUSED)
  unit.audit({ action: 'create', record: ['bar.stock-location', locationId] })
  return locationId
}

/** Changes a location. One that holds stock, or that an outlet in use sells from, cannot be retired. */
export async function updateLocation(unit: UnitView, locationId: string, input: LocationPatch): Promise<void> {
  const row = await first<{ name: string, space_id: string | null, venue_id: string | null, active: number }>('SELECT name, space_id, venue_id, active FROM bar_stock_locations WHERE id = ?', locationId)
  if (!row) refuse(GONE('stock-location').code, GONE('stock-location').reason, { status: 404 })
  const name = input.name ?? row!.name
  const spaceId = input.spaceId === undefined ? row!.space_id : input.spaceId
  const venueId = input.venueId === undefined ? row!.venue_id : input.venueId
  const active = input.active === undefined ? !!row!.active : input.active
  if (!active && row!.active) {
    if (await first('SELECT 1 FROM bar_stock_levels WHERE location_id = ? AND quantity <> 0', locationId))
      refuse('bar.stock-location.holds-stock', 'This location still holds stock.', { status: 409, remedy: 'Move or write off its stock first.' })
    if (await first('SELECT 1 FROM bar_outlets WHERE stock_location_id = ? AND active = 1', locationId))
      refuse('bar.stock-location.in-use', 'An outlet takes its stock from this location.', { status: 409, remedy: 'Point the outlet at another location first.' })
  }
  unit.add({
    sql: `UPDATE bar_stock_locations SET name = ?, space_id = ?, venue_id = ?, active = ?, updated_at = ?
          WHERE id = ? AND (? = 0 OR NOT EXISTS (SELECT 1 FROM bar_stock_locations WHERE active = 1 AND id <> ? AND lower(name) = lower(?)))
          AND (? IS NULL OR EXISTS (SELECT 1 FROM core_spaces WHERE id = ?)) AND (? IS NULL OR EXISTS (SELECT 1 FROM core_venues WHERE id = ?))
          AND (? = 1 OR NOT EXISTS (SELECT 1 FROM bar_stock_levels WHERE location_id = ? AND quantity <> 0))`,
    params: [name, spaceId, venueId, active ? 1 : 0, nowMs(), locationId, active ? 1 : 0, locationId, name, spaceId, spaceId, venueId, venueId, active ? 1 : 0, locationId],
  }).expect(1, LOCATION_REFUSED)
  unit.audit({ action: 'update', record: ['bar.stock-location', locationId], ...(active === !!row!.active ? {} : { detail: { active } }) })
}

export async function recipe(variantId: string): Promise<RecipeLine[]> {
  return await all<RecipeLine>(
    'SELECT id, stock_item_id AS stockItemId, choice_group_id AS choiceGroupId, quantity FROM bar_recipe_lines WHERE variant_id = ? ORDER BY position, id', variantId,
  )
}

/**
 * Replaces a size's recipe. A fixed line names an item in use; a slot names one of the product's
 * choices, and the option picked supplies the item (for a mixers group, the quantity is servings).
 */
export async function setRecipe(unit: UnitView, variantId: string, input: RecipeInput): Promise<void> {
  if (!await first('SELECT 1 FROM bar_variants WHERE id = ?', variantId)) refuse('bar.variant.unknown', 'There is no such size.', { status: 404 })
  const at = nowMs()
  unit.add({ sql: 'DELETE FROM bar_recipe_lines WHERE variant_id = ?', params: [variantId] })
  input.lines.forEach((line, position) => {
    if ('stockItemId' in line) {
      unit.add({
        sql: `INSERT INTO bar_recipe_lines (id, variant_id, stock_item_id, choice_group_id, quantity, position, created_at, updated_at)
              SELECT ?, ?, i.id, NULL, ?, ?, ?, ? FROM bar_stock_items i WHERE i.id = ? AND i.active = 1`,
        params: [newId('brcl'), variantId, line.quantity, position, at, at, line.stockItemId],
      }).expect(1, { code: 'bar.recipe.unknown-item', reason: 'One of those stock items is not in use.', remedy: 'Pick items that are in use.' })
    }
    else {
      unit.add({
        sql: `INSERT INTO bar_recipe_lines (id, variant_id, stock_item_id, choice_group_id, quantity, position, created_at, updated_at)
              SELECT ?, v.id, NULL, pg.group_id, ?, ?, ?, ? FROM bar_variants v JOIN bar_product_choice_groups pg ON pg.product_id = v.product_id
              WHERE v.id = ? AND pg.group_id = ?`,
        params: [newId('brcl'), line.quantity, position, at, at, variantId, line.choiceGroupId],
      }).expect(1, { code: 'bar.recipe.unknown-choice', reason: 'One of those choices is not asked on this product.', remedy: 'Attach the choice to the product first.' })
    }
  })
  unit.audit({ action: 'update', record: ['bar.product', (await first<{ product_id: string }>('SELECT product_id FROM bar_variants WHERE id = ?', variantId))!.product_id], detail: { recipe: variantId } })
}

export interface Movement { itemId: string, locationId: string, kind: 'sale' | 'sale_reversal' | 'delivery' | 'wastage' | 'transfer_out' | 'transfer_in', quantity: number, reasonTerm?: string | null, sourceType: string, sourceId: string, key: string, by: string | null }

/** Writes movements in one statement whatever their number; one already written (by its key) is passed over. */
export function writeMovements(unit: UnitView, rows: Movement[], at: number): void {
  if (!rows.length) return
  unit.add({
    sql: `INSERT INTO bar_stock_movements (id, stock_item_id, location_id, kind, quantity, reason_term, source_type, source_id, idempotency_key, by, at, created_at)
          SELECT json_extract(j.value, '$.id'), json_extract(j.value, '$.i'), json_extract(j.value, '$.l'), json_extract(j.value, '$.k'), json_extract(j.value, '$.q'), json_extract(j.value, '$.r'),
                 json_extract(j.value, '$.st'), json_extract(j.value, '$.s'), json_extract(j.value, '$.key'), json_extract(j.value, '$.by'), ?1, ?1
            FROM json_each(?2) j WHERE true ON CONFLICT (idempotency_key) DO NOTHING`,
    params: [at, JSON.stringify(rows.map(r => ({ id: newId('bstm'), i: r.itemId, l: r.locationId, k: r.kind, q: r.quantity, r: r.reasonTerm ?? null, st: r.sourceType, s: r.sourceId, key: r.key, by: r.by })))],
  })
}

/**
 * What a paid sale takes from its outlet's location: each line's recipe, a fixed line by its own
 * quantity, a slot by the option picked (a mixer by its own recipe, that many servings). Keyed by sale
 * line and recipe line (and the pick, and the mixer's line), so a repeat moves nothing more.
 */
export async function saleMovements(saleId: string): Promise<Movement[]> {
  const sale = await first<{ location_id: string | null, sold_by: string }>(
    'SELECT o.stock_location_id AS location_id, s.sold_by FROM bar_sales s JOIN bar_openings op ON op.id = s.opening_id JOIN bar_outlets o ON o.id = op.outlet_id WHERE s.id = ?', saleId,
  )
  if (!sale?.location_id) return []
  const lines = await all<{ id: string, variant_id: string, quantity: number }>('SELECT id, variant_id, quantity FROM bar_sale_lines WHERE sale_id = ? ORDER BY id', saleId)
  const picks = await all<{ id: string, sale_line_id: string, group_id: string, item_id: string | null, mixer_variant_id: string | null }>(
    `SELECT c.id, c.sale_line_id, c.group_id, o.stock_item_id AS item_id, c.mixer_variant_id FROM bar_sale_line_choices c
       JOIN bar_sale_lines l ON l.id = c.sale_line_id LEFT JOIN bar_choice_options o ON o.id = c.option_id WHERE l.sale_id = ? ORDER BY c.id`, saleId,
  )
  const variants = [...new Set([...lines.map(l => l.variant_id), ...picks.flatMap(p => p.mixer_variant_id ? [p.mixer_variant_id] : [])])]
  const recipes = new Map<string, { id: string, stock_item_id: string | null, choice_group_id: string | null, quantity: number }[]>()
  for (const r of await all<{ id: string, variant_id: string, stock_item_id: string | null, choice_group_id: string | null, quantity: number }>(
    'SELECT id, variant_id, stock_item_id, choice_group_id, quantity FROM bar_recipe_lines WHERE variant_id IN (SELECT value FROM json_each(?)) ORDER BY position, id', JSON.stringify(variants),
  )) recipes.set(r.variant_id, [...recipes.get(r.variant_id) ?? [], r])

  const out: Movement[] = []
  const move = (line: { id: string }, itemId: string, quantity: number, key: string) =>
    out.push({ itemId, locationId: sale.location_id!, kind: 'sale', quantity: -quantity, sourceType: 'bar.sale-line', sourceId: line.id, key: `bar:sale-line:${key}`, by: sale.sold_by })
  for (const line of lines) {
    for (const r of recipes.get(line.variant_id) ?? []) {
      if (r.stock_item_id) {
        move(line, r.stock_item_id, line.quantity * r.quantity, `${line.id}:${r.id}`)
        continue
      }
      for (const pick of picks.filter(p => p.sale_line_id === line.id && p.group_id === r.choice_group_id)) {
        if (pick.item_id) move(line, pick.item_id, line.quantity * r.quantity, `${line.id}:${r.id}:${pick.id}`)
        // A mixer's own recipe, by its fixed lines only: a mixer is not made of other choices.
        for (const m of pick.mixer_variant_id ? recipes.get(pick.mixer_variant_id) ?? [] : []) {
          if (m.stock_item_id) move(line, m.stock_item_id, line.quantity * r.quantity * m.quantity, `${line.id}:${r.id}:${pick.id}:${m.id}`)
        }
      }
    }
  }
  return out
}

/** Called in the batch that marks the sale paid. */
export async function moveForSale(unit: UnitView, saleId: string): Promise<void> {
  writeMovements(unit, await saleMovements(saleId), nowMs())
}

/**
 * A refund's reversals with the goods returned put back what their lines took, in proportion to the
 * quantity refunded, to the location it came from. Wasted or not returned: nothing moves back.
 */
export async function returnForRefund(unit: UnitView, refundId: string): Promise<void> {
  const rows = await all<{ reversal_id: string, by: string, reversed: number, sold: number, movement_id: string, item_id: string, location_id: string, quantity: number }>(
    `SELECT r.id AS reversal_id, r.requested_by AS by, r.quantity AS reversed, l.quantity AS sold, m.id AS movement_id, m.stock_item_id AS item_id, m.location_id, m.quantity
       FROM bar_sale_reversals r JOIN bar_sale_lines l ON l.id = r.sale_line_id
       JOIN bar_stock_movements m ON m.source_type = 'bar.sale-line' AND m.source_id = l.id AND m.kind = 'sale'
      WHERE r.refund_id = ? AND r.state = 'requested' AND r.stock_outcome = 'returned' AND r.quantity > 0 ORDER BY r.id, m.id`,
    refundId,
  )
  writeMovements(unit, rows.map(r => ({
    itemId: r.item_id, locationId: r.location_id, kind: 'sale_reversal' as const, quantity: Math.round(-r.quantity * r.reversed / r.sold),
    sourceType: 'bar.sale-reversal', sourceId: r.reversal_id, key: `bar:reversal:${r.reversal_id}:${r.movement_id}`, by: r.by,
  })).filter(m => m.quantity > 0), nowMs())
}
