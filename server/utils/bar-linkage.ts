import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { auditEntry, changes } from '#shared/utils/audit'
import type { SQL } from 'drizzle-orm'

// F-128: both directions are read from the components that already exist. Nothing stores a link,
// and every predicate here scopes by subquery rather than by an id list read first (0006).

export interface PouredBy {
  id: string
  name: string
}

// An active product pours an item when one of its live sizes depletes it, or offers a choice one
// of whose options does. A column over the row being read, so it binds nothing per product.
export function pouredByColumn(alias: string): SQL {
  const item = sql`${sql.raw(alias)}.id`
  return sql`(
    SELECT json_group_array(json_object('id', id, 'name', name))
    FROM (
      SELECT DISTINCT p.id AS id, p.name AS name
      FROM bar_products p
      JOIN product_variants v ON v.product_id = p.id AND v.status = 'ACTIVE'
      JOIN variant_components c ON c.variant_id = v.id
      WHERE p.status = 'ACTIVE' AND (
        c.item_id = ${item}
        OR EXISTS (
          SELECT 1 FROM choice_group_items g
          WHERE g.choice_group_id = c.choice_group_id AND g.item_id = ${item}
        )
      )
      ORDER BY p.name COLLATE NOCASE
    )
  )`
}

// SQLite hands back json_group_array as text, and an empty group as an empty array.
function readJsonArray<T>(value: string | null): T[] {
  if (!value) return []
  const parsed = JSON.parse(value) as T[]
  return Array.isArray(parsed) ? parsed : []
}

export const readPouredBy = (value: string | null): PouredBy[] => readJsonArray(value)

// The other direction: the items a product's live sizes deplete, or offer as a choice. A subquery
// over the product it is handed, so it binds nothing per product or item (0006).
function itemsPouredBy(product: SQL): SQL {
  return sql`
    SELECT c.item_id FROM product_variants v JOIN variant_components c ON c.variant_id = v.id
    WHERE v.product_id = ${product} AND v.status = 'ACTIVE' AND c.item_id IS NOT NULL
    UNION
    SELECT g.item_id FROM product_variants v JOIN variant_components c ON c.variant_id = v.id
    JOIN choice_group_items g ON g.choice_group_id = c.choice_group_id
    WHERE v.product_id = ${product} AND v.status = 'ACTIVE'
  `
}

const restrictedPoured = (product: SQL): SQL =>
  sql`SELECT 1 FROM bar_items r WHERE r.age_restricted = 1 AND r.id IN (${itemsPouredBy(product)})`

// Issue 1299: which restricted stocked items a product pours, by name, for the list and the editor.
export function restrictedPoursColumn(alias: string): SQL {
  return sql`(
    SELECT json_group_array(name) FROM (
      SELECT r.name AS name FROM bar_items r
      WHERE r.age_restricted = 1 AND r.id IN (${itemsPouredBy(sql.raw(`${alias}.id`))})
      ORDER BY r.name COLLATE NOCASE
    )
  )`
}

export const readRestrictedPours = (value: string | null): string[] => readJsonArray(value)

// The Bar Manager's correction list: any product left unrestricted that pours restricted stock.
// Hidden and retired count, since either goes back on the till with one press.
export function withoutCheckIdPredicate(alias: string): SQL {
  return sql`(${sql.raw(alias)}.age_restricted = 0 AND EXISTS (${restrictedPoured(sql.raw(`${alias}.id`))}))`
}

// Rides an edit's own UPDATE, so a component landing between the read and the write cannot leave
// a product pouring restricted stock saved without Check ID (0049).
export function checkIdHeld(productId: string, ageRestricted: boolean): SQL {
  return ageRestricted ? sql`1 = 1` : sql`NOT EXISTS (${restrictedPoured(sql`${productId}`)})`
}

// Servings one recipe row supports: its item's on-hand over the quantity a serving takes.
function servingsOfRow(alias: 'c' | 'g' | 'o'): SQL {
  const row = sql.raw(alias)
  return sql`(SELECT coalesce(sum(m.qty), 0) FROM stock_movements m WHERE m.item_id = ${row}.item_id) / ${row}.qty`
}
const poured = servingsOfRow('c')

// The tightest component decides, and a choice is as good as its best-stocked option, since the
// customer picks one. A size that depletes nothing answers null rather than nought (F-128).
function servingsQuery(products: SQL): SQL {
  const chosen = sql`(
    SELECT max(${servingsOfRow('g')})
    FROM choice_group_items g WHERE g.choice_group_id = c.choice_group_id
  )`
  return sql`
    SELECT v.id AS variantId, v.label AS label,
           (
             SELECT min(CASE WHEN c.item_id IS NOT NULL THEN ${poured} ELSE coalesce(${chosen}, 0) END)
             FROM variant_components c WHERE c.variant_id = v.id
           ) AS servings
    FROM product_variants v
    WHERE v.product_id IN (${products}) AND v.status = 'ACTIVE'
    ORDER BY v.sort, v.label COLLATE NOCASE
  `
}

export function servingsAvailableQuery(productId: string): SQL {
  return servingsQuery(sql`SELECT ${productId}`)
}

// One option of a size's choice: its own item held to the size's fixed components, which is what
// picking it pours, so the best option's figure is the size's own (F-128 criterion 9).
function optionServingsQuery(products: SQL): SQL {
  const own = servingsOfRow('o')
  const fixed = sql`(SELECT min(${poured}) FROM variant_components c WHERE c.variant_id = v.id AND c.item_id IS NOT NULL)`
  return sql`
    SELECT v.id AS variantId, o.id AS optionId, min(${own}, coalesce(${fixed}, ${own})) AS servings
    FROM product_variants v
    JOIN variant_components k ON k.variant_id = v.id AND k.choice_group_id IS NOT NULL
    JOIN choice_group_items o ON o.choice_group_id = k.choice_group_id
    WHERE v.product_id IN (${products}) AND v.status = 'ACTIVE'
  `
}

// Every size and every choice option on the till in one read, scoped by subquery so it binds
// nothing per product or option (0006); a size's own row has no option.
export function tillServingsQuery(): SQL {
  const products = sql`SELECT id FROM bar_products WHERE status = 'ACTIVE'`
  return sql`
    SELECT variantId, NULL AS optionId, servings FROM (${servingsQuery(products)})
    UNION ALL
    ${optionServingsQuery(products)}
  `
}

export interface TillServingsRow {
  variantId: string
  optionId: string | null
  servings: number | null
}

export interface TillServings {
  sizes: Map<string, number | null>
  // Keyed by size, then by the option row's id: one option reads differently under each size.
  options: Map<string, Map<string, number>>
}

export function readTillServings(found: TillServingsRow[]): TillServings {
  const sizes = new Map<string, number | null>()
  const options = new Map<string, Map<string, number>>()
  for (const row of found) {
    const servings = row.servings === null ? null : Number(row.servings)
    if (row.optionId === null) {
      sizes.set(row.variantId, servings)
      continue
    }
    if (servings === null) continue
    const ofSize = options.get(row.variantId) ?? new Map<string, number>()
    ofSize.set(row.optionId, servings)
    options.set(row.variantId, ofSize)
  }
  return { sizes, options }
}

export async function tillServings(): Promise<TillServings> {
  return readTillServings(await db.all<TillServingsRow>(tillServingsQuery()))
}

// Until a stocktake is applied every item reads nought, so on-hand is not yet a balance (0080).
export const STOCK_COUNTED_QUERY = sql`SELECT EXISTS (SELECT 1 FROM stocktakes WHERE status = 'APPLIED') AS counted`

export async function stockCounted(): Promise<boolean> {
  const [row] = await db.all<{ counted: number }>(STOCK_COUNTED_QUERY)
  return Number(row?.counted) === 1
}

export interface ServingsAvailable {
  variantId: string
  label: string
  servings: number | null
}

export async function servingsAvailableOf(productId: string): Promise<ServingsAvailable[]> {
  const found = await db.all<ServingsAvailable>(servingsAvailableQuery(productId))
  return found.map(row => ({ ...row, servings: row.servings === null ? null : Number(row.servings) }))
}

// The products that would lose their recipe, for the refusal to name (F-128 criterion 5).
export function dependentProductsQuery(itemId: string): SQL {
  return sql`
    SELECT DISTINCT p.id AS id, p.name AS name
    FROM bar_products p
    JOIN product_variants v ON v.product_id = p.id AND v.status = 'ACTIVE'
    JOIN variant_components c ON c.variant_id = v.id
    WHERE p.status = 'ACTIVE' AND (
      c.item_id = ${itemId}
      OR EXISTS (
        SELECT 1 FROM choice_group_items g
        WHERE g.choice_group_id = c.choice_group_id AND g.item_id = ${itemId}
      )
    )
    ORDER BY p.name COLLATE NOCASE
  `
}

export async function dependentProducts(itemId: string): Promise<PouredBy[]> {
  return db.all<PouredBy>(dependentProductsQuery(itemId))
}

export interface RetireItem {
  actorId: string
  // Retire the item and hide what pours it in the same batch, rather than refusing (criterion 6).
  hideDependents: boolean
}

export interface RetirePlan {
  statements: readonly SQL[]
  // Which statement retires the item: its own result is the proof this request won (0049).
  retireAt: number
}

// Every predicate rides its own statement: the on-hand sum as a subquery, the dependants scoped by
// subquery over the components, so nothing landing in the window slips past (0006, 0049).
export function retireItemStatements(itemId: string, options: RetireItem): RetirePlan {
  const stillPoured = sql`
    EXISTS (
      SELECT 1 FROM bar_products p
      JOIN product_variants v ON v.product_id = p.id AND v.status = 'ACTIVE'
      JOIN variant_components c ON c.variant_id = v.id
      WHERE p.status = 'ACTIVE' AND (
        c.item_id = ${itemId}
        OR EXISTS (
          SELECT 1 FROM choice_group_items g
          WHERE g.choice_group_id = c.choice_group_id AND g.item_id = ${itemId}
        )
      )
    )
  `

  const statements: SQL[] = []

  if (options.hideDependents) {
    // The same conditions the item's own retirement carries, so a request whose retirement does
    // nothing cannot still take products off the till.
    const hiding = sql`
      status = 'ACTIVE'
      AND (SELECT status FROM bar_items WHERE id = ${itemId}) = 'ACTIVE'
      AND (SELECT coalesce(sum(m.qty), 0) FROM stock_movements m WHERE m.item_id = ${itemId}) = 0
      AND EXISTS (
        SELECT 1 FROM product_variants v
        JOIN variant_components c ON c.variant_id = v.id
        WHERE v.product_id = bar_products.id AND v.status = 'ACTIVE' AND (
          c.item_id = ${itemId}
          OR EXISTS (
            SELECT 1 FROM choice_group_items g
            WHERE g.choice_group_id = c.choice_group_id AND g.item_id = ${itemId}
          )
        )
      )
    `

    // The trail is written from the same predicate, one row per product, before the update that
    // changes them: inside one batch both statements read the same rows, and neither binds an id.
    statements.push(sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT lower(hex(randomblob(16))), ${options.actorId}, 'bar.product.status.changed',
             'bar-product:' || bar_products.id,
             json_object('changes', json_object('status', json_object('from', 'ACTIVE', 'to', 'HIDDEN')))
      FROM bar_products WHERE ${hiding}
    `)

    statements.push(sql`UPDATE bar_products SET status = 'HIDDEN' WHERE ${hiding}`)
  }

  const retireAt = statements.length
  statements.push(sql`
    UPDATE bar_items SET status = 'RETIRED'
    WHERE id = ${itemId} AND status = 'ACTIVE'
      AND (SELECT coalesce(sum(m.qty), 0) FROM stock_movements m WHERE m.item_id = ${itemId}) = 0
      AND NOT ${stillPoured}
    RETURNING id
  `)

  const entry = auditEntry({
    actorId: options.actorId,
    action: 'bar.item.status.changed',
    target: `bar-item:${itemId}`,
    detail: changes({ status: ['ACTIVE', 'RETIRED'] }),
  })

  statements.push(sql`
    INSERT INTO audit_log (id, actor_id, action, target, detail)
    SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${JSON.stringify(entry.detail)}
    WHERE changes() = 1
  `)

  return { statements, retireAt }
}
