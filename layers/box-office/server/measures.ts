// Box office's figures (Reports REP-02): tickets counted from its own tables and money from its own
// accounts in the ledger, each on the performance's operating day (M8) and narrowed by subquery (M9).
import { sql, type SQL } from 'drizzle-orm'
import { useDb, type Breakdown, type MeasureQuery, type MeasureRow } from '#kit'
import { isPerformanceBreakdown, keyColumn, measuredPerformances } from '#modules/core'
import { performanceTotals, type PerformanceTotal } from '#modules/finance'

export const PERFORMANCE_KEYS: Breakdown[] = ['performance', 'production', 'season', 'venue', 'space', 'day', 'month']
export const TICKET_KEYS: Breakdown[] = [...PERFORMANCE_KEYS, 'box-office.ticket-type', 'box-office.channel']
export const TICKET_FILTERS: Breakdown[] = ['box-office.ticket-type', 'box-office.channel']
export const ABILITY = 'box-office.report.view'

/** A key with no value, such as the season of a production in none. */
export const NONE = 'none'

const OWN: Record<string, SQL> = { 'box-office.ticket-type': sql`l.ticket_type_id`, 'box-office.channel': sql`o.channel` }
const keySql = (key: Breakdown): SQL => isPerformanceBreakdown(key) ? sql.raw(`mp.${keyColumn(key)}`) : OWN[key]!
const performanceKeys = (by: Breakdown[]) => by.filter(isPerformanceBreakdown)
const groupAs = (i: number) => sql.raw(`g${i}`)
const keysOf = (by: Breakdown[], row: Record<string, unknown>) => Object.fromEntries(by.map((k, i) => [k, row[`g${i}`] === null ? NONE : String(row[`g${i}`])]))

/**
 * Counts valid tickets (or what `count` says of them) on performances in the period and scope,
 * where `where` holds, grouped by the asked keys. `unsupported` for a scope a performance cannot answer.
 */
export async function countTickets(query: MeasureQuery, options: { where?: SQL, count?: SQL } = {}): Promise<{ rows: MeasureRow[] } | 'unsupported'> {
  const performances = measuredPerformances(query, performanceKeys(query.by))
  if (!performances) return 'unsupported'
  const filter = query.filter ? sql` AND ${keySql(query.filter.key)} IN (SELECT value FROM json_each(${JSON.stringify(query.filter.values)}))` : sql``
  const columns = [...query.by.map((k, i) => sql`${keySql(k)} AS ${groupAs(i)}`), sql`${options.count ?? sql`count(*)`} AS value`]
  const rows = await useDb().all<Record<string, unknown>>(sql`
    SELECT ${sql.join(columns, sql`, `)}
    FROM box_office_tickets t
    JOIN box_office_order_lines l ON l.id = t.order_line_id
    JOIN box_office_orders o ON o.id = l.order_id
    JOIN box_office_ticket_types ty ON ty.id = l.ticket_type_id
    JOIN (${performances}) mp ON mp.performance_id = t.performance_id
    WHERE t.state = 'valid'${options.where ? sql` AND ${options.where}` : sql``}${filter}
    ${query.by.length ? sql`GROUP BY ${sql.join(query.by.map((_, i) => groupAs(i)), sql`, `)}` : sql``}`)
  return { rows: rows.map(r => ({ keys: keysOf(query.by, r), value: Number(r.value ?? 0) })) }
}

/** Seats on sale at performances in the period and scope: every band's pool, added up. */
export async function countCapacity(query: MeasureQuery): Promise<{ rows: MeasureRow[] } | 'unsupported'> {
  const performances = measuredPerformances(query, performanceKeys(query.by))
  if (!performances) return 'unsupported'
  const columns = [...query.by.map((k, i) => sql`${keySql(k)} AS ${groupAs(i)}`), sql`coalesce(sum(b.capacity), 0) AS value`]
  const rows = await useDb().all<Record<string, unknown>>(sql`
    SELECT ${sql.join(columns, sql`, `)}
    FROM box_office_pools b JOIN (${performances}) mp ON mp.performance_id = b.performance_id
    ${query.by.length ? sql`GROUP BY ${sql.join(query.by.map((_, i) => groupAs(i)), sql`, `)}` : sql``}`)
  return { rows: rows.map(r => ({ keys: keysOf(query.by, r), value: Number(r.value ?? 0) })) }
}

/**
 * Money on Box office's own accounts by performance, worked out by `pick` from each performance's
 * totals by kind of posting, then added up by the asked keys and currency. Never across currencies (M7).
 */
export async function sumMoney(query: MeasureQuery, pick: (totals: PerformanceTotal[]) => number): Promise<{ rows: MeasureRow[] } | 'unsupported'> {
  const keys = performanceKeys(query.by)
  const performances = measuredPerformances(query, keys)
  if (!performances) return 'unsupported'
  const totals = await performanceTotals('box-office', sql`SELECT performance_id FROM (${performances})`)
  const keyed = new Map<string, Record<string, string>>()
  if (keys.length) {
    for (const row of await useDb().all<Record<string, unknown>>(performances)) {
      keyed.set(String(row.performance_id), Object.fromEntries(keys.map(k => [k, row[keyColumn(k)] === null ? NONE : String(row[keyColumn(k)])])))
    }
  }
  const byPerformance = new Map<string, PerformanceTotal[]>()
  for (const t of totals) byPerformance.set(`${t.performanceId}\u0000${t.currency}`, [...byPerformance.get(`${t.performanceId}\u0000${t.currency}`) ?? [], t])
  const out = new Map<string, MeasureRow>()
  for (const group of byPerformance.values()) {
    const { performanceId, currency } = group[0]!
    const rowKeys = keys.length ? keyed.get(performanceId) ?? {} : {}
    const id = JSON.stringify([rowKeys, currency])
    const row = out.get(id) ?? { keys: rowKeys, value: 0, currency }
    row.value += pick(group)
    out.set(id, row)
  }
  return { rows: [...out.values()] }
}

const credits = (totals: PerformanceTotal[], kind?: string) => totals.filter(t => !kind || t.kind === kind).reduce((sum, t) => sum + t.creditsMinor, 0)

/** What was paid for tickets and everything sold with them. */
export const gross = (totals: PerformanceTotal[]) => credits(totals, 'sale')
/** What was given back, as a positive amount. */
export const refunds = (totals: PerformanceTotal[]) => -credits(totals, 'refund')
/** What was kept: every kind of posting, so a move between Box office's own accounts nets to nothing. */
export const net = (totals: PerformanceTotal[]) => credits(totals)
/** What was kept, less the tax within it. */
export const netOfVat = (totals: PerformanceTotal[]) => credits(totals) - totals.reduce((sum, t) => sum + t.taxMinor, 0)
