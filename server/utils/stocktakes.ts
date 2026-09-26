import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { stocktakesList } from '#shared/utils/stocktakes-list'
import { unitCostPence } from './bar-reports'
import { aliasColumns, count, predicate, whereFrom } from './list-filters'
import type { SQL } from 'drizzle-orm'
import type { Stocktake, StocktakeLine } from '#shared/utils/stocktakes'
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

interface StocktakeLineRow extends Omit<StocktakeLine, 'variance' | 'varianceCostPence'> {
  variance: number | null
  unitCostPence: number | null
}

function readLine(row: StocktakeLineRow): StocktakeLine {
  const { unitCostPence, ...rest } = row
  return {
    ...rest,
    varianceCostPence: row.variance === null || unitCostPence === null ? null : row.variance * unitCostPence,
  }
}

// Priced the same way the applied variance report values a line (server/utils/bar-reports.ts's
// unitCostPence, F-119's basis), so a stocktake in progress never disagrees with what it applies as.
export function stocktakeLinesQuery(stocktakeId: string): SQL {
  return sql`
    SELECT l.id AS id, l.item_id AS itemId, i.name AS itemName, i.unit AS unit,
           i.container_ml AS containerMl, i.category AS category,
           l.expected_qty AS expectedQty, l.counted_qty AS countedQty,
           CASE WHEN l.counted_qty IS NULL THEN NULL ELSE l.counted_qty - l.expected_qty END AS variance,
           ${unitCostPence} AS unitCostPence
    FROM stocktake_lines l JOIN bar_items i ON i.id = l.item_id
    WHERE l.stocktake_id = ${stocktakeId}
    ORDER BY i.category IS NULL, i.category COLLATE NOCASE, i.name COLLATE NOCASE
  `
}

export async function stocktakeLines(stocktakeId: string): Promise<StocktakeLine[]> {
  return (await db.all<StocktakeLineRow>(stocktakeLinesQuery(stocktakeId))).map(readLine)
}
