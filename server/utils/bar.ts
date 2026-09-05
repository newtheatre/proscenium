import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { SERVING_KINDS, effectivePriceRow } from '#shared/utils/bar'
import type { BarCategory, BarProduct, CategoryPrice, ChoiceGroup, ProductVariant, StockItem, StockMovement, VariantComponent, VariantPrice } from '#shared/utils/bar'

// Reading the bar's catalogue and its stock. Two questions the module leans on live here: what a
// product needs before it may be sold, and what is on hand. Neither is a column.

// Every table pointing at `bar_products`, declared as a sale, a requirement, or neither. A new
// referencing table joins this or `tests/integration/bar-catalogue.test.ts` fails (F-111).
export interface BarProductReference {
  table: string
  column: string
  // True when a row here means something was sold, so the product may only be retired.
  sale: boolean
  // What the product gains by having a row here, or null when it is not needed to go active.
  requiredToActivate: string | null
  // Which rows count towards that requirement, as SQL over the referencing table. Written here
  // and never taken from a request, which is what makes raw interpolation of it safe.
  countingOnly?: string
  why: string
}

// A product with a serving size may go active with no recipe line at all; F-113 only refuses one
// that already calls for a retired ingredient (known-issues.md).
export const BAR_PRODUCT_REFERENCES: BarProductReference[] = [
  {
    table: 'product_variants',
    column: 'product_id',
    sale: false,
    requiredToActivate: 'a serving size',
    countingOnly: `status = 'ACTIVE'`,
    why: 'the sizes it sells at: a product with none has no button for the till to draw (F-112)',
  },
]

export function productSaleReferences(references = BAR_PRODUCT_REFERENCES): BarProductReference[] {
  return references.filter(reference => reference.sale)
}

export function productActivationReferences(references = BAR_PRODUCT_REFERENCES): BarProductReference[] {
  return references.filter(reference => reference.requiredToActivate !== null)
}

// A correlated EXISTS per sale table, binding nothing: the parameter count is fixed however many
// products or lines exist (0003, 0006).
export function productEverSoldColumn(alias: string, references = productSaleReferences()): SQL {
  if (references.length === 0) return sql`0`
  const terms = references.map(reference =>
    sql`EXISTS (SELECT 1 FROM ${sql.raw(reference.table)} WHERE ${sql.raw(reference.column)} = ${sql.raw(alias)}.id)`)
  return sql`CASE WHEN ${sql.join(terms, sql` OR `)} THEN 1 ELSE 0 END`
}

// The same question about one product, bound by its id. One parameter per sale table, no list.
export function productEverSoldQuery(productId: string, references = productSaleReferences()): SQL {
  if (references.length === 0) return sql`SELECT 0 AS sold`
  const terms = references.map(reference =>
    sql`EXISTS (SELECT 1 FROM ${sql.raw(reference.table)} WHERE ${sql.raw(reference.column)} = ${productId})`)
  return sql`SELECT CASE WHEN ${sql.join(terms, sql` OR `)} THEN 1 ELSE 0 END AS sold`
}

// One row per thing the product still lacks, so a refusal can name them. An empty result means it
// may go on the till.
export function missingBeforeActiveQuery(productId: string, references = productActivationReferences()): SQL {
  if (references.length === 0) return sql`SELECT NULL AS needs WHERE 0`
  const terms = references.map(reference => sql`
    SELECT ${reference.requiredToActivate} AS needs
    WHERE NOT EXISTS (
      SELECT 1 FROM ${sql.raw(reference.table)} WHERE ${sql.raw(reference.column)} = ${productId}
      ${reference.countingOnly ? sql`AND ${sql.raw(reference.countingOnly)}` : sql``}
    )
  `)
  return sql.join(terms, sql` UNION ALL `)
}

export async function missingBeforeActive(productId: string): Promise<string[]> {
  if (productActivationReferences().length === 0) return []
  return (await db.all<{ needs: string }>(missingBeforeActiveQuery(productId))).map(row => row.needs)
}

// An item an active variant's recipe still calls for, directly or via a choice group, that has
// since been retired: a recipe set while active can go stale under it (F-113 criterion 5).
export function retiredIngredientsQuery(productId: string): SQL {
  return sql`
    SELECT name FROM (
      SELECT i.name AS name
      FROM product_variants v
      JOIN variant_components c ON c.variant_id = v.id
      JOIN bar_items i ON i.id = c.item_id
      WHERE v.product_id = ${productId} AND v.status = 'ACTIVE' AND i.status = 'RETIRED'
      UNION
      SELECT gi.name AS name
      FROM product_variants v
      JOIN variant_components c ON c.variant_id = v.id
      JOIN choice_group_items g ON g.choice_group_id = c.choice_group_id
      JOIN bar_items gi ON gi.id = g.item_id
      WHERE v.product_id = ${productId} AND v.status = 'ACTIVE' AND gi.status = 'RETIRED'
    )
    ORDER BY name COLLATE NOCASE
  `
}

export async function retiredIngredientsOf(productId: string): Promise<string[]> {
  return (await db.all<{ name: string }>(retiredIngredientsQuery(productId))).map(row => row.name)
}

// Every FK to `product_variants` is classified here or the build fails (bar-variants.test.ts,
// F-111's rule). `ledger_lines.product_variant_id` has no FK, so F-105's sale row is by hand.
export const VARIANT_REFERENCES: BarProductReference[] = [
  {
    table: 'variant_prices',
    column: 'variant_id',
    sale: false,
    requiredToActivate: null,
    why: 'what this size costs from a date: configuration, and nobody has bought anything',
  },
  {
    table: 'variant_components',
    column: 'variant_id',
    sale: false,
    requiredToActivate: null,
    why: 'what pouring one consumes: a recipe, not a sale',
  },
]

export function variantSaleReferences(references = VARIANT_REFERENCES): BarProductReference[] {
  return references.filter(reference => reference.sale)
}

export function variantEverSoldColumn(alias: string, references = variantSaleReferences()): SQL {
  if (references.length === 0) return sql`0`
  const terms = references.map(reference =>
    sql`EXISTS (SELECT 1 FROM ${sql.raw(reference.table)} WHERE ${sql.raw(reference.column)} = ${sql.raw(alias)}.id)`)
  return sql`CASE WHEN ${sql.join(terms, sql` OR `)} THEN 1 ELSE 0 END`
}

export function variantEverSoldQuery(variantId: string, references = variantSaleReferences()): SQL {
  if (references.length === 0) return sql`SELECT 0 AS sold`
  const terms = references.map(reference =>
    sql`EXISTS (SELECT 1 FROM ${sql.raw(reference.table)} WHERE ${sql.raw(reference.column)} = ${variantId})`)
  return sql`SELECT CASE WHEN ${sql.join(terms, sql` OR `)} THEN 1 ELSE 0 END AS sold`
}

// The latest row on or before the day, ties broken by `rowid`: `created_at` is second precision
// and `id` a random UUID, but this table never deletes, so `rowid` is insertion order (F-116).
export function effectivePriceColumn(alias: string, on: string): SQL {
  return sql`(
    SELECT p.price_pence FROM variant_prices p
    WHERE p.variant_id = ${sql.raw(alias)}.id AND p.effective_from <= ${on}
    ORDER BY p.effective_from DESC, p.created_at DESC, p.rowid DESC
    LIMIT 1
  )`
}

// The category's own default for the variant's serving kind, read only when the variant has none
// of its own: the caller decides precedence, this only answers one level (0017, F-121 criterion 2).
export function effectiveCategoryPriceColumn(categoryId: SQL, servingKind: SQL, on: string): SQL {
  return sql`(
    SELECT cp.price_pence FROM category_prices cp
    WHERE cp.category_id = ${categoryId} AND cp.serving_kind = ${servingKind} AND cp.effective_from <= ${on}
    ORDER BY cp.effective_from DESC, cp.created_at DESC, cp.rowid DESC
    LIMIT 1
  )`
}

// Variant price first, category default second, null when neither prices it (0017, F-121
// criterion 2). `priceSource` names which level answered, so a stray override is visible (criterion 5).
export function resolvedPriceColumns(categoryId: SQL, variantAlias: string, on: string): { pricePence: SQL, priceSource: SQL } {
  const variantPrice = effectivePriceColumn(variantAlias, on)
  const categoryPrice = effectiveCategoryPriceColumn(categoryId, sql`${sql.raw(variantAlias)}.serving_kind`, on)
  return {
    pricePence: sql`COALESCE(${variantPrice}, ${categoryPrice})`,
    priceSource: sql`CASE WHEN ${variantPrice} IS NOT NULL THEN 'variant' WHEN ${categoryPrice} IS NOT NULL THEN 'category' ELSE NULL END`,
  }
}

// On-hand is the sum of an item's movements, computed where it is asked for and stored nowhere
// (F-114 criterion 2).
export function onHandColumn(alias: string): SQL {
  return sql`(SELECT coalesce(sum(m.qty), 0) FROM stock_movements m WHERE m.item_id = ${sql.raw(alias)}.id)`
}

export function onHandOf(itemId: string): SQL {
  return sql`SELECT coalesce(sum(qty), 0) AS onHand FROM stock_movements WHERE item_id = ${itemId}`
}

export async function onHand(itemId: string): Promise<number> {
  const [row] = await db.all<{ onHand: number }>(onHandOf(itemId))
  return Number(row?.onHand ?? 0)
}

// A typed percent sign is a character somebody is looking for, not a wildcard.
const contains = (term: string): string => `%${term.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`

const search = (term: string | undefined, column: string): SQL[] =>
  term ? [sql`${sql.raw(column)} LIKE ${contains(term)} ESCAPE '\\'`] : []

const where = (terms: SQL[]): SQL => (terms.length ? sql` WHERE ${sql.join(terms, sql` AND `)}` : sql``)

interface Counted { total: number }

const count = async (statement: SQL): Promise<number> =>
  Number((await db.all<Counted>(statement))[0]?.total ?? 0)

export interface CategoryFilters { search?: string }

// Allow-listed columns rather than a whole row, here as everywhere a payload leaves the database.
export function categoriesQuery(filters: CategoryFilters, limit: number, offset: number): SQL {
  return sql`
    SELECT c.id AS id, c.name AS name, c.sort AS sort, c.colour AS colour,
           (SELECT count(*) FROM bar_products p WHERE p.category_id = c.id) AS productCount
    FROM bar_categories c${where(search(filters.search, 'c.name'))}
    ORDER BY c.sort, c.name COLLATE NOCASE
    LIMIT ${limit} OFFSET ${offset}
  `
}

export async function listCategories(filters: CategoryFilters, limit: number, offset: number): Promise<BarCategory[]> {
  return db.all<BarCategory>(categoriesQuery(filters, limit, offset))
}

export async function countCategories(filters: CategoryFilters): Promise<number> {
  return count(sql`SELECT count(*) AS total FROM bar_categories c${where(search(filters.search, 'c.name'))}`)
}

export async function categoryById(id: string): Promise<BarCategory | undefined> {
  const [row] = await db.all<BarCategory>(sql`
    SELECT c.id AS id, c.name AS name, c.sort AS sort, c.colour AS colour,
           (SELECT count(*) FROM bar_products p WHERE p.category_id = c.id) AS productCount
    FROM bar_categories c WHERE c.id = ${id}
  `)
  return row
}

export async function categoryNamed(name: string, exceptId?: string): Promise<BarCategory | undefined> {
  const except = exceptId ? sql` AND c.id <> ${exceptId}` : sql``
  const [row] = await db.all<BarCategory>(sql`
    SELECT c.id AS id, c.name AS name, c.sort AS sort, c.colour AS colour, 0 AS productCount
    FROM bar_categories c WHERE c.name = ${name} COLLATE NOCASE${except} LIMIT 1
  `)
  return row
}

export interface ProductFilters {
  includeRetired: boolean
  categoryId?: string
  search?: string
}

interface ProductRow extends Omit<BarProduct, 'staffedOnly' | 'ageRestricted' | 'everSold'> {
  staffedOnly: number
  ageRestricted: number
  everSold: number
}

const readProduct = (row: ProductRow): BarProduct => ({
  ...row,
  staffedOnly: row.staffedOnly === 1,
  ageRestricted: row.ageRestricted === 1,
  everSold: row.everSold === 1,
})

const PRODUCT_COLUMNS = sql`
  p.id AS id,
  p.name AS name,
  p.category_id AS categoryId,
  c.name AS categoryName,
  p.sort AS sort,
  p.status AS status,
  p.staffed_only AS staffedOnly,
  p.age_restricted AS ageRestricted,
  p.allergen_state AS allergenState,
  p.allergen_note AS allergenNote
`

// Two bound parameters at most, whatever the filters and however many products there are (0003).
function productPredicate(filters: ProductFilters): SQL {
  const terms: SQL[] = [...search(filters.search, 'p.name')]
  if (!filters.includeRetired) terms.push(sql`p.status <> 'RETIRED'`)
  if (filters.categoryId) terms.push(sql`p.category_id = ${filters.categoryId}`)
  return where(terms)
}

export function productsQuery(filters: ProductFilters, limit: number, offset: number): SQL {
  return sql`
    SELECT ${PRODUCT_COLUMNS}, ${productEverSoldColumn('p')} AS everSold
    FROM bar_products p JOIN bar_categories c ON c.id = p.category_id${productPredicate(filters)}
    ORDER BY c.sort, c.name COLLATE NOCASE, p.sort, p.name COLLATE NOCASE
    LIMIT ${limit} OFFSET ${offset}
  `
}

export async function listProducts(filters: ProductFilters, limit: number, offset: number): Promise<BarProduct[]> {
  return (await db.all<ProductRow>(productsQuery(filters, limit, offset))).map(readProduct)
}

export async function countProducts(filters: ProductFilters): Promise<number> {
  return count(sql`
    SELECT count(*) AS total FROM bar_products p
    JOIN bar_categories c ON c.id = p.category_id${productPredicate(filters)}
  `)
}

export async function productById(id: string): Promise<BarProduct | undefined> {
  const [row] = await db.all<ProductRow>(sql`
    SELECT ${PRODUCT_COLUMNS}, ${productEverSoldColumn('p')} AS everSold
    FROM bar_products p JOIN bar_categories c ON c.id = p.category_id WHERE p.id = ${id}
  `)
  return row ? readProduct(row) : undefined
}

export async function productNamed(name: string, exceptId?: string): Promise<BarProduct | undefined> {
  const except = exceptId ? sql` AND p.id <> ${exceptId}` : sql``
  const [row] = await db.all<ProductRow>(sql`
    SELECT ${PRODUCT_COLUMNS}, ${productEverSoldColumn('p')} AS everSold
    FROM bar_products p JOIN bar_categories c ON c.id = p.category_id
    WHERE p.name = ${name} COLLATE NOCASE${except} LIMIT 1
  `)
  return row ? readProduct(row) : undefined
}

export interface ItemFilters {
  includeRetired: boolean
  search?: string
}

interface ItemRow extends Omit<StockItem, 'ageRestricted' | 'hasMovements'> {
  ageRestricted: number
  hasMovements: number
}

const readItem = (row: ItemRow): StockItem => ({
  ...row,
  onHand: Number(row.onHand),
  ageRestricted: row.ageRestricted === 1,
  hasMovements: row.hasMovements === 1,
})

const ITEM_COLUMNS = sql`
  i.id AS id,
  i.name AS name,
  i.unit AS unit,
  i.container_ml AS containerMl,
  i.par_qty AS parQty,
  i.category AS category,
  i.age_restricted AS ageRestricted,
  i.allergen_notes AS allergenNotes,
  i.status AS status
`

const MOVED = sql`CASE WHEN EXISTS (SELECT 1 FROM stock_movements m WHERE m.item_id = i.id) THEN 1 ELSE 0 END`

function itemPredicate(filters: ItemFilters): SQL {
  const terms: SQL[] = [...search(filters.search, 'i.name')]
  if (!filters.includeRetired) terms.push(sql`i.status = 'ACTIVE'`)
  return where(terms)
}

export function itemsQuery(filters: ItemFilters, limit: number, offset: number): SQL {
  return sql`
    SELECT ${ITEM_COLUMNS}, ${onHandColumn('i')} AS onHand, ${MOVED} AS hasMovements
    FROM bar_items i${itemPredicate(filters)}
    ORDER BY i.status, i.name COLLATE NOCASE
    LIMIT ${limit} OFFSET ${offset}
  `
}

export async function listItems(filters: ItemFilters, limit: number, offset: number): Promise<StockItem[]> {
  return (await db.all<ItemRow>(itemsQuery(filters, limit, offset))).map(readItem)
}

export async function countItems(filters: ItemFilters): Promise<number> {
  return count(sql`SELECT count(*) AS total FROM bar_items i${itemPredicate(filters)}`)
}

export async function itemById(id: string): Promise<StockItem | undefined> {
  const [row] = await db.all<ItemRow>(sql`
    SELECT ${ITEM_COLUMNS}, ${onHandColumn('i')} AS onHand, ${MOVED} AS hasMovements
    FROM bar_items i WHERE i.id = ${id}
  `)
  return row ? readItem(row) : undefined
}

export async function itemNamed(name: string, exceptId?: string): Promise<StockItem | undefined> {
  const except = exceptId ? sql` AND i.id <> ${exceptId}` : sql``
  const [row] = await db.all<ItemRow>(sql`
    SELECT ${ITEM_COLUMNS}, ${onHandColumn('i')} AS onHand, ${MOVED} AS hasMovements
    FROM bar_items i WHERE i.name = ${name} COLLATE NOCASE${except} LIMIT 1
  `)
  return row ? readItem(row) : undefined
}

interface VariantRow extends Omit<ProductVariant, 'everSold' | 'everPriced' | 'components'> {
  everSold: number
  everPriced: number
}

// Whether anything has priced this size, past, today or future: append-only, so this is what
// gates deletion rather than `pricePence`, which only answers for today (F-116).
export function everPricedColumn(alias: string): SQL {
  return sql`(SELECT EXISTS (SELECT 1 FROM variant_prices WHERE variant_id = ${sql.raw(alias)}.id))`
}

interface ComponentRow extends Omit<VariantComponent, 'includedInPrice'> {
  variantId: string
  includedInPrice: number
}

const VARIANT_COLUMNS = sql`
  v.id AS id,
  v.product_id AS productId,
  v.serving_kind AS servingKind,
  v.label AS label,
  v.status AS status,
  v.sort AS sort
`

// Scoped by subquery rather than by an id list read out of the variants: a bound-parameter count
// must not grow with the rows it covers (0003, 0006).
function componentsQuery(scope: SQL): SQL {
  return sql`
    SELECT c.id AS id, c.variant_id AS variantId, c.item_id AS itemId, i.name AS itemName, i.unit AS unit,
           c.choice_group_id AS choiceGroupId, g.name AS choiceGroupName,
           c.qty AS qty, c.included_in_price AS includedInPrice
    FROM variant_components c
    LEFT JOIN bar_items i ON i.id = c.item_id
    LEFT JOIN choice_groups g ON g.id = c.choice_group_id
    WHERE c.variant_id IN (${scope})
    ORDER BY i.name COLLATE NOCASE, g.name COLLATE NOCASE
  `
}

const readComponent = (row: ComponentRow): VariantComponent => ({
  id: row.id,
  itemId: row.itemId,
  itemName: row.itemName,
  unit: row.unit,
  choiceGroupId: row.choiceGroupId,
  choiceGroupName: row.choiceGroupName,
  qty: row.qty,
  includedInPrice: row.includedInPrice === 1,
})

function withComponents(variants: VariantRow[], components: ComponentRow[]): ProductVariant[] {
  return variants.map(variant => ({
    ...variant,
    pricePence: variant.pricePence === null ? null : Number(variant.pricePence),
    everSold: variant.everSold === 1,
    everPriced: variant.everPriced === 1,
    components: components.filter(component => component.variantId === variant.id).map(readComponent),
  }))
}

// Every size a product sells at, each with what it depletes and what it costs today.
export async function variantsOf(productId: string, on: string, includeRetired = true): Promise<ProductVariant[]> {
  const retired = includeRetired ? sql`` : sql` AND v.status = 'ACTIVE'`
  const { pricePence, priceSource } = resolvedPriceColumns(sql`p.category_id`, 'v', on)
  const variants = await db.all<VariantRow>(sql`
    SELECT ${VARIANT_COLUMNS}, ${pricePence} AS pricePence, ${priceSource} AS priceSource,
           ${variantEverSoldColumn('v')} AS everSold, ${everPricedColumn('v')} AS everPriced
    FROM product_variants v JOIN bar_products p ON p.id = v.product_id
    WHERE v.product_id = ${productId}${retired}
    ORDER BY v.status, v.sort, v.label COLLATE NOCASE
  `)
  const components = await db.all<ComponentRow>(componentsQuery(sql`SELECT id FROM product_variants WHERE product_id = ${productId}`))
  return withComponents(variants, components)
}

export async function variantById(id: string, on: string): Promise<ProductVariant | undefined> {
  const { pricePence, priceSource } = resolvedPriceColumns(sql`p.category_id`, 'v', on)
  const [row] = await db.all<VariantRow>(sql`
    SELECT ${VARIANT_COLUMNS}, ${pricePence} AS pricePence, ${priceSource} AS priceSource,
           ${variantEverSoldColumn('v')} AS everSold, ${everPricedColumn('v')} AS everPriced
    FROM product_variants v JOIN bar_products p ON p.id = v.product_id
    WHERE v.id = ${id}
  `)
  if (!row) return undefined
  const components = await db.all<ComponentRow>(componentsQuery(sql`SELECT id FROM product_variants WHERE id = ${id}`))
  return withComponents([row], components)[0]
}

interface ChoiceGroupOptionRow {
  id: string
  choiceGroupId: string
  itemId: string
  itemName: string
  unit: string
  qty: number
  sort: number
}

function choiceGroupOptionsQuery(scope: SQL): SQL {
  return sql`
    SELECT o.id AS id, o.choice_group_id AS choiceGroupId, o.item_id AS itemId, i.name AS itemName,
           i.unit AS unit, o.qty AS qty, o.sort AS sort
    FROM choice_group_items o JOIN bar_items i ON i.id = o.item_id
    WHERE o.choice_group_id IN (${scope})
    ORDER BY o.sort, i.name COLLATE NOCASE
  `
}

function withOptions(groups: { id: string, name: string }[], options: ChoiceGroupOptionRow[]): ChoiceGroup[] {
  return groups.map(group => ({
    ...group,
    options: options
      .filter(option => option.choiceGroupId === group.id)
      .map(({ id, itemId, itemName, unit, qty, sort }) => ({ id, itemId, itemName, unit: unit as StockItem['unit'], qty, sort })),
  }))
}

export async function listChoiceGroups(): Promise<ChoiceGroup[]> {
  const groups = await db.all<{ id: string, name: string }>(sql`SELECT id, name FROM choice_groups ORDER BY name COLLATE NOCASE`)
  const options = await db.all<ChoiceGroupOptionRow>(choiceGroupOptionsQuery(sql`SELECT id FROM choice_groups`))
  return withOptions(groups, options)
}

export async function choiceGroupById(id: string): Promise<ChoiceGroup | undefined> {
  const [group] = await db.all<{ id: string, name: string }>(sql`SELECT id, name FROM choice_groups WHERE id = ${id}`)
  if (!group) return undefined
  const options = await db.all<ChoiceGroupOptionRow>(choiceGroupOptionsQuery(sql`SELECT id FROM choice_groups WHERE id = ${id}`))
  return withOptions([group], options)[0]
}

// A group's options can go stale after it is attached somewhere, the same way a direct recipe
// line can: an item retired later, not one refused when it was added.
export async function retiredOptionsOf(choiceGroupId: string): Promise<string[]> {
  const rows = await db.all<{ name: string }>(sql`
    SELECT i.name AS name FROM choice_group_items g JOIN bar_items i ON i.id = g.item_id
    WHERE g.choice_group_id = ${choiceGroupId} AND i.status = 'RETIRED'
    ORDER BY i.name COLLATE NOCASE
  `)
  return rows.map(row => row.name)
}

// The whole series, newest first, with the row today resolves to marked (F-116 criterion 5).
export async function priceHistory(variantId: string, on: string): Promise<VariantPrice[]> {
  const history = await db.all<Omit<VariantPrice, 'effective'>>(sql`
    SELECT p.id AS id, p.variant_id AS variantId, p.price_pence AS pricePence,
           p.effective_from AS effectiveFrom, p.created_at AS createdAt, p.created_by AS createdBy,
           p.rowid AS seq
    FROM variant_prices p WHERE p.variant_id = ${variantId}
    ORDER BY p.effective_from DESC, p.created_at DESC, p.rowid DESC
  `)
  const winner = effectivePriceRow(history, on)
  return history.map(price => ({ ...price, effective: price.id === winner?.id }))
}

// The whole series across every serving kind, each kind's winner marked within its own group: a
// spirit's single and double default resolve independently (F-121 criterion 1).
export async function categoryPriceHistory(categoryId: string, on: string): Promise<CategoryPrice[]> {
  const history = await db.all<Omit<CategoryPrice, 'effective'>>(sql`
    SELECT cp.id AS id, cp.category_id AS categoryId, cp.serving_kind AS servingKind,
           cp.price_pence AS pricePence, cp.effective_from AS effectiveFrom,
           cp.created_at AS createdAt, cp.created_by AS createdBy, cp.rowid AS seq
    FROM category_prices cp WHERE cp.category_id = ${categoryId}
    ORDER BY cp.serving_kind, cp.effective_from DESC, cp.created_at DESC, cp.rowid DESC
  `)
  const winners = new Map(SERVING_KINDS.map(kind =>
    [kind, effectivePriceRow(history.filter(row => row.servingKind === kind), on)?.id]))
  return history.map(price => ({ ...price, effective: price.id === winners.get(price.servingKind) }))
}

export interface MovementFilters {
  itemId?: string
  kind?: string
  search?: string
}

const MOVEMENT_COLUMNS = sql`
  m.id AS id,
  m.item_id AS itemId,
  i.name AS itemName,
  i.unit AS unit,
  m.qty AS qty,
  m.kind AS kind,
  m.reason AS reason,
  m.unit_cost_pence AS unitCostPence,
  m.ref_table AS refTable,
  m.ref_id AS refId,
  m.reverses_id AS reversesId,
  m.actor_id AS actorId,
  m.created_at AS createdAt,
  CASE WHEN EXISTS (SELECT 1 FROM stock_movements r WHERE r.reverses_id = m.id) THEN 1 ELSE 0 END AS reversed
`

interface MovementRow extends Omit<StockMovement, 'reversed'> {
  reversed: number
}

const readMovement = (row: MovementRow): StockMovement => ({ ...row, reversed: row.reversed === 1 })

function movementPredicate(filters: MovementFilters): SQL {
  const terms: SQL[] = [...search(filters.search, 'i.name')]
  if (filters.itemId) terms.push(sql`m.item_id = ${filters.itemId}`)
  if (filters.kind) terms.push(sql`m.kind = ${filters.kind}`)
  return where(terms)
}

export function movementsQuery(filters: MovementFilters, limit: number, offset: number): SQL {
  return sql`
    SELECT ${MOVEMENT_COLUMNS}
    FROM stock_movements m JOIN bar_items i ON i.id = m.item_id${movementPredicate(filters)}
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT ${limit} OFFSET ${offset}
  `
}

export async function listMovements(filters: MovementFilters, limit: number, offset: number): Promise<StockMovement[]> {
  return (await db.all<MovementRow>(movementsQuery(filters, limit, offset))).map(readMovement)
}

export async function countMovements(filters: MovementFilters): Promise<number> {
  return count(sql`
    SELECT count(*) AS total FROM stock_movements m
    JOIN bar_items i ON i.id = m.item_id${movementPredicate(filters)}
  `)
}

export async function movementById(id: string): Promise<StockMovement | undefined> {
  const [row] = await db.all<MovementRow>(sql`
    SELECT ${MOVEMENT_COLUMNS} FROM stock_movements m JOIN bar_items i ON i.id = m.item_id WHERE m.id = ${id}
  `)
  return row ? readMovement(row) : undefined
}
