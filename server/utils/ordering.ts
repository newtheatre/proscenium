import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { onHandColumn } from '#server/utils/bar'
import type { SQL } from 'drizzle-orm'
import type { OrderListRow, UnconfiguredRow } from '#shared/utils/ordering'

// The suggested order list: what live on-hand says against par, for items that carry one
// (F-120). Advisory only; nothing here ever places an order.

// On-hand is computed once, in the inner query, and reused by alias: the aggregate over
// stock_movements is otherwise expensive to repeat per row across the select list and the filter.
function shortfallQuery(): SQL {
  return sql`
    SELECT id, name, unit, category, onHand, parQty, parQty - onHand AS shortfall
    FROM (
      SELECT i.id AS id, i.name AS name, i.unit AS unit, i.category AS category,
             i.par_qty AS parQty, ${onHandColumn('i')} AS onHand
      FROM bar_items i
      WHERE i.status = 'ACTIVE' AND i.par_qty IS NOT NULL
    )
    WHERE onHand < parQty
    ORDER BY category IS NULL, category COLLATE NOCASE, name COLLATE NOCASE
  `
}

function unconfiguredQuery(): SQL {
  return sql`
    SELECT i.id AS id, i.name AS name, i.category AS category
    FROM bar_items i
    WHERE i.status = 'ACTIVE' AND i.par_qty IS NULL
    ORDER BY i.category IS NULL, i.category COLLATE NOCASE, i.name COLLATE NOCASE
  `
}

export async function shortfalls(): Promise<OrderListRow[]> {
  return (await db.all<OrderListRow>(shortfallQuery())).map(row => ({ ...row, onHand: Number(row.onHand) }))
}

export async function unconfiguredItems(): Promise<UnconfiguredRow[]> {
  return db.all<UnconfiguredRow>(unconfiguredQuery())
}
