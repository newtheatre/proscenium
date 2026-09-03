import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { BarCategory, BarProduct, StockItem, StockMovement } from '#shared/utils/bar'

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
  why: string
}

// Empty until F-112 adds serving sizes and F-113 adds recipes. A product with no requirements
// may go active, which is the honest answer while nothing can be sold at all.
export const BAR_PRODUCT_REFERENCES: BarProductReference[] = []

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
    WHERE NOT EXISTS (SELECT 1 FROM ${sql.raw(reference.table)} WHERE ${sql.raw(reference.column)} = ${productId})
  `)
  return sql.join(terms, sql` UNION ALL `)
}

export async function missingBeforeActive(productId: string): Promise<string[]> {
  if (productActivationReferences().length === 0) return []
  return (await db.all<{ needs: string }>(missingBeforeActiveQuery(productId))).map(row => row.needs)
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

export interface MovementFilters {
  itemId?: string
  kind?: string
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
  m.created_at AS createdAt
`

function movementPredicate(filters: MovementFilters): SQL {
  const terms: SQL[] = []
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
  return db.all<StockMovement>(movementsQuery(filters, limit, offset))
}

export async function countMovements(filters: MovementFilters): Promise<number> {
  return count(sql`
    SELECT count(*) AS total FROM stock_movements m
    JOIN bar_items i ON i.id = m.item_id${movementPredicate(filters)}
  `)
}

export async function movementById(id: string): Promise<StockMovement | undefined> {
  const [row] = await db.all<StockMovement>(sql`
    SELECT ${MOVEMENT_COLUMNS} FROM stock_movements m JOIN bar_items i ON i.id = m.item_id WHERE m.id = ${id}
  `)
  return row
}
