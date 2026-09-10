import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (0055).
import { committeeYearEnd, fromLondonWallClock, startOfLondonDay } from '#shared/utils/london'
import { foregone } from './finance-reports'
import { londonDayOf } from '#shared/utils/ledger'
import type { PeriodInput, RevenueBySource, SeasonSummary } from '#shared/utils/season-dashboard'
import type { SQL } from 'drizzle-orm'

// The season dashboard (I-105): every figure a query scoped by a predicate over a resolved
// range, never one parameter per row it covers (0001, 0003, 0006).

const WEEK_DAYS = 7

// Calendar-only arithmetic on the date string itself, never on an instant: a fixed number of
// seconds added across a DST transition gives the wrong day (unlike startOfLondonDay per day).
function addDays(day: string, amount: number): string {
  const [year, month, date] = day.split('-').map(Number)
  const next = new Date(Date.UTC(year!, month! - 1, date! + amount))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`
}

function seconds(at: Date): number {
  return Math.floor(at.getTime() / 1000)
}

export interface Bounds { fromAt: number, toAt: number, fromDay: string, toDay: string }

// Both bounds are exclusive at the end in seconds, but `fromDay`/`toDay` are the inclusive
// calendar range I-103's own `foregoneQuery` PERIOD scope already expects (criterion 4).
export function periodBounds(period: PeriodInput): Bounds {
  if (period.kind === 'DAY') {
    const toDayExclusive = addDays(period.day, 1)
    return { fromAt: seconds(startOfLondonDay(period.day)), toAt: seconds(startOfLondonDay(toDayExclusive)), fromDay: period.day, toDay: period.day }
  }
  if (period.kind === 'WEEK') {
    const toDayExclusive = addDays(period.day, WEEK_DAYS)
    return { fromAt: seconds(startOfLondonDay(period.day)), toAt: seconds(startOfLondonDay(toDayExclusive)), fromDay: period.day, toDay: addDays(toDayExclusive, -1) }
  }
  if (period.kind === 'MONTH') {
    const from = fromLondonWallClock(period.year, period.month, 1)
    const to = period.month === 12 ? fromLondonWallClock(period.year + 1, 1, 1) : fromLondonWallClock(period.year, period.month + 1, 1)
    return { fromAt: seconds(from), toAt: seconds(to), fromDay: londonDayOf(from), toDay: londonDayOf(new Date(to.getTime() - 1000)) }
  }
  if (period.kind === 'TERM') {
    // The range itself, already resolved by the caller from I-107's own defined term (criterion
    // 4 of that story): a term has no fixed rule, unlike every other kind here.
    const toDayExclusive = addDays(period.toDay, 1)
    return { fromAt: seconds(startOfLondonDay(period.fromDay)), toAt: seconds(startOfLondonDay(toDayExclusive)), fromDay: period.fromDay, toDay: period.toDay }
  }
  // SEASON: 1 August to 31 July, named by the year it ends in (criterion 1, 0009).
  const from = fromLondonWallClock(period.year - 1, 8, 1)
  const to = new Date(committeeYearEnd(period.year).getTime() + 1)
  return { fromAt: seconds(from), toAt: seconds(to), fromDay: londonDayOf(from), toDay: `${period.year}-07-31` }
}

// Only a CARD-tendered line is money the theatre holds (I-106's own rule, kept here too): TAB is
// credit extended, COMP took nothing, NONE is a pass admission, IMPORT is history.
export function revenueBySourceQuery(fromAt: number, toAt: number): SQL {
  return sql`
    SELECT le.source AS source, coalesce(sum(ll.amount_pence), 0) AS totalPence
    FROM ledger_lines ll JOIN ledger_entries le ON le.id = ll.entry_id
    WHERE le.tender = 'CARD' AND le.happened_at >= ${fromAt} AND le.happened_at < ${toAt}
    GROUP BY le.source
  `
}

export function seasonRefundsQuery(fromAt: number, toAt: number): SQL {
  return sql`
    SELECT coalesce(-sum(le.total_pence), 0) AS refundsPence
    FROM ledger_entries le
    WHERE le.tender = 'CARD' AND le.reverses_entry_id IS NOT NULL
      AND le.happened_at >= ${fromAt} AND le.happened_at < ${toAt}
  `
}

// The season's still-open reconciliation gap (I-104's own current-row pattern), summed rather
// than counted: a treasurer needs to know how much is unexplained, not just how many nights.
export function openVarianceQuery(fromDay: string, toDay: string): SQL {
  return sql`
    SELECT coalesce(sum(z.variance_pence), 0) AS openVariancePence
    FROM z_readings z
    WHERE z.night >= ${fromDay} AND z.night <= ${toDay}
      AND z.variance_pence <> 0 AND z.written_off = 0
      AND z.id NOT IN (SELECT supersedes_id FROM z_readings WHERE supersedes_id IS NOT NULL)
  `
}

export async function seasonSummary(period: PeriodInput): Promise<SeasonSummary> {
  const bounds = periodBounds(period)
  const [bySource, [refunds], [openVariance], theForegone] = await Promise.all([
    db.all<RevenueBySource>(revenueBySourceQuery(bounds.fromAt, bounds.toAt)),
    db.all<{ refundsPence: number }>(seasonRefundsQuery(bounds.fromAt, bounds.toAt)),
    db.all<{ openVariancePence: number }>(openVarianceQuery(bounds.fromDay, bounds.toDay)),
    foregone({ scope: 'PERIOD', from: bounds.fromDay, to: bounds.toDay }),
  ])
  return {
    fromDay: bounds.fromDay,
    toDay: bounds.toDay,
    revenueBySource: bySource,
    refundsPence: refunds?.refundsPence ?? 0,
    compsPence: theForegone.compsPence,
    discountsPence: theForegone.discountsPence,
    openVariancePence: openVariance?.openVariancePence ?? 0,
  }
}

export interface SeasonEntry { id: string, happenedAt: number, source: string, tender: string, totalPence: number }

// Every figure drills down to its ledger entries (criterion 3): scoped by the same range plus an
// optional source, paged in SQL, never a bare array.
function sourceFilter(source: string | undefined): SQL {
  return source ? sql`AND le.source = ${source}` : sql``
}

export function seasonEntriesQuery(fromAt: number, toAt: number, source: string | undefined, limit: number, offset: number): SQL {
  return sql`
    SELECT le.id AS id, le.happened_at AS happenedAt, le.source AS source, le.tender AS tender, le.total_pence AS totalPence
    FROM ledger_entries le
    WHERE le.tender = 'CARD' AND le.happened_at >= ${fromAt} AND le.happened_at < ${toAt} ${sourceFilter(source)}
    ORDER BY le.happened_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `
}

export function seasonEntriesCountQuery(fromAt: number, toAt: number, source: string | undefined): SQL {
  return sql`
    SELECT count(*) AS total
    FROM ledger_entries le
    WHERE le.tender = 'CARD' AND le.happened_at >= ${fromAt} AND le.happened_at < ${toAt} ${sourceFilter(source)}
  `
}

export async function seasonEntries(fromAt: number, toAt: number, source: string | undefined, limit: number, offset: number): Promise<{ items: SeasonEntry[], total: number }> {
  const [items, [count]] = await Promise.all([
    db.all<SeasonEntry>(seasonEntriesQuery(fromAt, toAt, source, limit, offset)),
    db.all<{ total: number }>(seasonEntriesCountQuery(fromAt, toAt, source)),
  ])
  return { items, total: count?.total ?? 0 }
}
