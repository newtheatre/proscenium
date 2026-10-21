import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { stocktakesList } from '#shared/utils/stocktakes-list'
import { unitCostPence } from './bar-reports'
import { aliasColumns, count, predicate, whereFrom } from './list-filters'
import type { SQL } from 'drizzle-orm'
import type { Stocktake, StocktakeLine } from '#shared/utils/stocktakes'
import type { AuditRow } from '#shared/utils/audit'
import type { StockUnit } from '#shared/utils/bar'
import type { ListQuery } from '#shared/utils/list-filters'
import type { ListClause } from './list-filters'

// Reading a stocktake and its lines (F-115). Opening, counting and applying are each the write
// path's own SQL in their routes; what a reader needs is here so nothing restates the shape.

const STOCKTAKE_COLUMNS = sql`
  id AS id, status AS status, opened_by AS openedBy, opened_at AS openedAt,
  applied_by AS appliedBy, applied_at AS appliedAt
`

export function stocktakeByIdQuery(id: string): SQL {
  return sql`SELECT ${STOCKTAKE_COLUMNS} FROM stocktakes WHERE id = ${id}`
}

// The singleton: at most one row can ever hold status = 'OPEN' (the partial unique index).
export function openStocktakeQuery(): SQL {
  return sql`SELECT ${STOCKTAKE_COLUMNS} FROM stocktakes WHERE status = 'OPEN'`
}

export async function stocktakeById(id: string): Promise<Stocktake | undefined> {
  const [row] = await db.all<Stocktake>(stocktakeByIdQuery(id))
  return row
}

export async function openStocktake(): Promise<Stocktake | undefined> {
  const [row] = await db.all<Stocktake>(openStocktakeQuery())
  return row
}

// The declaration's predicates and order, through the `t` alias the raw SQL below uses (K-129).
export function stocktakesClause(query: ListQuery): ListClause {
  return whereFrom(stocktakesList, query, { column: aliasColumns('t'), search: [sql`t.status`] })
}

const STOCKTAKE_LIST_COLUMNS = sql`
  t.id AS id, t.status AS status, t.opened_by AS openedBy, t.opened_at AS openedAt,
  t.applied_by AS appliedBy, t.applied_at AS appliedAt
`

export function stocktakesQuery(clause: ListClause, limit: number, offset: number): SQL {
  return sql`
    SELECT ${STOCKTAKE_LIST_COLUMNS}
    FROM stocktakes t${predicate(clause)}
    ORDER BY ${sql.join(clause.orderBy, sql`, `)}
    LIMIT ${limit} OFFSET ${offset}
  `
}

export async function listStocktakes(clause: ListClause, limit: number, offset: number): Promise<Stocktake[]> {
  return db.all<Stocktake>(stocktakesQuery(clause, limit, offset))
}

export async function countStocktakes(clause: ListClause): Promise<number> {
  return count(sql`SELECT count(*) AS total FROM stocktakes t${predicate(clause)}`)
}

// Priced the same way the applied variance report values a line (server/utils/bar-reports.ts's
// unitCostPence, F-119's basis), so a stocktake in progress never disagrees with what it applies as.
export function stocktakeLinesQuery(stocktakeId: string): SQL {
  return sql`
    SELECT l.id AS id, l.item_id AS itemId, i.name AS itemName, i.unit AS unit,
           i.container_ml AS containerMl, i.category AS category,
           l.expected_qty AS expectedQty, l.counted_qty AS countedQty,
           CASE WHEN l.counted_qty IS NULL THEN NULL ELSE l.counted_qty - l.expected_qty END AS variance,
           round((l.counted_qty - l.expected_qty) * ${unitCostPence}) AS varianceCostPence, u.name AS countedByName
    FROM stocktake_lines l JOIN bar_items i ON i.id = l.item_id
    LEFT JOIN users u ON u.id = l.counted_by
    WHERE l.stocktake_id = ${stocktakeId}
    ORDER BY i.category IS NULL, i.category COLLATE NOCASE, i.name COLLATE NOCASE
  `
}

// One statement per count, each carrying its own "still open" predicate, so a stocktake applied
// mid-submission takes none of it. A count is compared with on-hand as it is entered (0126).
export function countStatements(stocktakeId: string, counts: readonly { itemId: string, counted: number | null }[], actorId: string): SQL[] {
  return counts.map(count => sql`
    UPDATE stocktake_lines
    SET counted_qty = ${count.counted}, counted_by = ${count.counted === null ? null : actorId},
        expected_qty = CASE WHEN ${count.counted} IS NULL THEN expected_qty
          ELSE (SELECT coalesce(sum(m.qty), 0) FROM stock_movements m WHERE m.item_id = stocktake_lines.item_id) END
    WHERE stocktake_id = ${stocktakeId} AND item_id = ${count.itemId}
      AND EXISTS (SELECT 1 FROM stocktakes WHERE id = ${stocktakeId} AND status = 'OPEN')
  `)
}

// What each counted line would leave on hand once applied, as of now: sales after the count stay.
function afterApply(stocktakeId: string): SQL {
  return sql`
    SELECT l.id AS lineId, i.name AS itemName, i.unit AS unit,
           (SELECT coalesce(sum(m.qty), 0) FROM stock_movements m WHERE m.item_id = l.item_id) + l.counted_qty - l.expected_qty AS after
    FROM stocktake_lines l JOIN bar_items i ON i.id = l.item_id
    WHERE l.stocktake_id = ${stocktakeId} AND l.counted_qty IS NOT NULL
  `
}

// The lines an apply would take below zero, which refuse the whole apply (0126).
export function stocktakeShortfallsQuery(stocktakeId: string): SQL {
  return sql`SELECT itemName, unit, after FROM (${afterApply(stocktakeId)}) WHERE after < 0 ORDER BY itemName COLLATE NOCASE`
}

export async function stocktakeShortfalls(stocktakeId: string): Promise<{ itemName: string, unit: StockUnit, after: number }[]> {
  return db.all(stocktakeShortfallsQuery(stocktakeId))
}

// The freeze, its audit row and one adjustment per differing count, chained on changes() so a
// losing or refused apply writes none of them (F-115 criterion 4, 0003). The guard rides the UPDATE.
export function applyStatements(stocktakeId: string, actorId: string, entry: AuditRow): SQL[] {
  return [
    sql`
      UPDATE stocktakes SET status = 'APPLIED', applied_by = ${actorId}, applied_at = unixepoch()
      WHERE id = ${stocktakeId} AND status = 'OPEN'
        AND NOT EXISTS (SELECT 1 FROM (${afterApply(stocktakeId)}) WHERE after < 0)
      RETURNING id
    `,
    sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${JSON.stringify(entry.detail)}
      WHERE changes() = 1
    `,
    sql`
      INSERT INTO stock_movements (id, item_id, qty, kind, ref_table, ref_id, actor_id)
      SELECT lower(hex(randomblob(16))), l.item_id, l.counted_qty - l.expected_qty, 'STOCKTAKE', 'stocktake_lines', l.id, ${actorId}
      FROM stocktake_lines l
      WHERE l.stocktake_id = ${stocktakeId} AND l.counted_qty IS NOT NULL AND l.counted_qty <> l.expected_qty AND changes() = 1
      RETURNING id
    `,
  ]
}

export async function stocktakeLines(stocktakeId: string): Promise<StocktakeLine[]> {
  return db.all<StocktakeLine>(stocktakeLinesQuery(stocktakeId))
}
