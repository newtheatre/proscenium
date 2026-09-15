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

// SQLite hands back the array as text, and an item nothing pours as an empty one.
export function readPouredBy(value: string | null): PouredBy[] {
  if (!value) return []
  const parsed = JSON.parse(value) as PouredBy[]
  return Array.isArray(parsed) ? parsed : []
}

// The tightest component decides, and a choice is as good as its best-stocked option, since the
// customer picks one. A size that depletes nothing answers null rather than nought (F-128).
export function servingsAvailableQuery(productId: string): SQL {
  const poured = sql`(SELECT coalesce(sum(m.qty), 0) FROM stock_movements m WHERE m.item_id = c.item_id) / c.qty`
  const chosen = sql`(
    SELECT max((SELECT coalesce(sum(m.qty), 0) FROM stock_movements m WHERE m.item_id = g.item_id) / g.qty)
    FROM choice_group_items g WHERE g.choice_group_id = c.choice_group_id
  )`
  return sql`
    SELECT v.id AS variantId, v.label AS label,
           (
             SELECT min(CASE WHEN c.item_id IS NOT NULL THEN ${poured} ELSE coalesce(${chosen}, 0) END)
             FROM variant_components c WHERE c.variant_id = v.id
           ) AS servings
    FROM product_variants v
    WHERE v.product_id = ${productId} AND v.status = 'ACTIVE'
    ORDER BY v.sort, v.label COLLATE NOCASE
  `
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
