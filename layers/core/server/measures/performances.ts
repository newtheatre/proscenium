// Performances for a figure (rules M8, M9): the operating days asked, narrowed by the scope with a
// subquery on core's tables, with each shared key a performance answers. Modules join their rows to it.
import { sql, type SQL } from 'drizzle-orm'
import type { MeasureQuery } from '#kit/measures'

/** The shared breakdowns a performance answers by itself. */
export const PERFORMANCE_BREAKDOWNS = ['performance', 'production', 'season', 'venue', 'space', 'day', 'month'] as const
export type PerformanceBreakdown = typeof PERFORMANCE_BREAKDOWNS[number]

const KEY: Record<PerformanceBreakdown, SQL> = {
  performance: sql`p.id`,
  production: sql`p.production_id`,
  season: sql`pr.season_id`,
  venue: sql`p.venue_id`,
  space: sql`p.space_id`,
  day: sql`p.operating_day`,
  month: sql`substr(p.operating_day, 1, 7)`, // not-policy: YYYY-MM of a YYYY-MM-DD date
}

/** Its column in measuredPerformances' answer, such as k_season. */
export const keyColumn = (key: PerformanceBreakdown) => `k_${key}`

/** Whether a key is one a performance answers. */
export const isPerformanceBreakdown = (key: string): key is PerformanceBreakdown => (PERFORMANCE_BREAKDOWNS as readonly string[]).includes(key)

/**
 * A derived table of `performance_id` and a `k_<key>` column for each asked key, for every performance
 * on an operating day in the period and inside the scope; null for a scope a performance cannot answer.
 */
export function measuredPerformances(query: Pick<MeasureQuery, 'from' | 'to' | 'scope'>, keys: readonly PerformanceBreakdown[] = []): SQL | null {
  const scope = query.scope ?? {}
  const [kind, id] = Object.entries(scope)[0] ?? []
  const within: Record<string, SQL> = {
    season: sql`pr.season_id = ${id}`,
    production: sql`p.production_id = ${id}`,
    performance: sql`p.id = ${id}`,
    venue: sql`p.venue_id = ${id}`,
    space: sql`p.space_id = ${id}`,
  }
  if (kind && !within[kind]) return null
  const columns = keys.map(k => sql`, ${KEY[k]} AS ${sql.raw(keyColumn(k))}`)
  return sql`SELECT p.id AS performance_id${sql.join(columns, sql``)}
    FROM core_performances p JOIN core_productions pr ON pr.id = p.production_id
    WHERE p.operating_day BETWEEN ${query.from} AND ${query.to}${kind ? sql` AND ${within[kind]!}` : sql``}`
}
