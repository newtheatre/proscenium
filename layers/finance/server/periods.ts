// Accounting periods: a month or a quarter, aligned to the first day of the financial year
// (finance.year.starts), made as postings need them. Each new period starts the day after the latest
// one ends, so periods never overlap and never leave a gap, even if the length setting changes.
import { all, first, newId, nowMs, today, useSetting, localDate, type UnitView } from '#kit'

export interface PeriodRow { id: string, label: string, starts_on: string, ends_on: string }

const YEAR = 12 // not-policy: months in a year
const QUARTER = 3 // not-policy: months in a quarter
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function parse(date: string): { y: number, m: number, d: number } {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return { y, m, d }
}

function format(y: number, m: number, d: number): string {
  const at = new Date(Date.UTC(y, m - 1, d))
  return at.toISOString().slice(0, 10) // not-policy: the length of YYYY-MM-DD
}

/** The date `n` months after `date`, on the same day of the month (days stop at 28, so it exists). */
function addMonths(date: string, n: number): string {
  const { y, m, d } = parse(date)
  const index = y * YEAR + (m - 1) + n
  return format(Math.floor(index / YEAR), (index % YEAR) + 1, d)
}

function addDays(date: string, n: number): string {
  const { y, m, d } = parse(date)
  return format(y, m, d + n)
}

/** The period of `months` months, aligned to the year's start, that contains `date`. */
export function periodContaining(date: string, months: number, yearStarts: string): { startsOn: string, endsOn: string } {
  const [sm, sd] = yearStarts.split('-').map(Number) as [number, number]
  const { y, m, d } = parse(date)
  let index = y * YEAR + (m - 1) - (d < sd ? 1 : 0)
  while (((index % YEAR) - (sm - 1) + YEAR) % months !== 0) index--
  const startsOn = format(Math.floor(index / YEAR), (index % YEAR) + 1, sd)
  return { startsOn, endsOn: addDays(addMonths(startsOn, months), -1) }
}

export function periodLabel(startsOn: string, endsOn: string): string {
  const s = parse(startsOn)
  const e = parse(endsOn)
  if (s.d === 1 && s.y === e.y && s.m === e.m) return `${MONTHS[s.m - 1]} ${s.y}`
  if (s.d === 1 && addDays(endsOn, 1).endsWith('-01')) return `${SHORT[s.m - 1]} ${s.y} to ${SHORT[e.m - 1]} ${e.y}`
  return `${s.d} ${SHORT[s.m - 1]} ${s.y} to ${e.d} ${SHORT[e.m - 1]} ${e.y}`
}

async function lengthInMonths(): Promise<number> {
  return (await useSetting('finance.periods.length')) === 'quarter' ? QUARTER : 1
}

/**
 * The periods to add so that one covers both `date` and today. Read before the unit is built; two
 * units that add the same period meet the unique start date and one of them is ignored.
 */
export async function missingPeriods(date: string): Promise<{ id: string, label: string, startsOn: string, endsOn: string }[]> {
  const months = await lengthInMonths()
  const now = await today()
  const until = date > now ? date : now
  const latest = await first<PeriodRow>('SELECT * FROM finance_periods ORDER BY starts_on DESC LIMIT 1')
  const out: { id: string, label: string, startsOn: string, endsOn: string }[] = []
  let next: { startsOn: string, endsOn: string }
  if (!latest) next = periodContaining(date < now ? date : now, months, await useSetting('finance.year.starts') as string)
  else if (latest.ends_on >= until) return out
  else {
    const startsOn = addDays(latest.ends_on, 1)
    next = { startsOn, endsOn: addDays(addMonths(startsOn, months), -1) }
  }
  for (let guard = 0; guard < 600; guard++) { // not-policy: fifty years of months stops a runaway loop
    out.push({ id: newId('fpe'), label: periodLabel(next.startsOn, next.endsOn), ...next })
    if (next.endsOn >= until) break
    const startsOn = addDays(next.endsOn, 1)
    next = { startsOn, endsOn: addDays(addMonths(startsOn, months), -1) }
  }
  return out
}

/** Adds the missing periods to the unit, ignoring any another unit has added meanwhile. */
export function addPeriods(unit: UnitView, periods: { id: string, label: string, startsOn: string, endsOn: string }[]): void {
  if (!periods.length) return
  const at = nowMs()
  unit.add({
    sql: `INSERT OR IGNORE INTO finance_periods (id, label, starts_on, ends_on, created_at, updated_at)
      SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]'), ?, ? FROM json_each(?)`,
    params: [at, at, JSON.stringify(periods.map(p => [p.id, p.label, p.startsOn, p.endsOn]))],
  })
}

/** SQL for whether period `alias` is closed now: its newest close row says close. */
export function closedSql(alias: string): string {
  return `coalesce((SELECT c.action FROM finance_period_closes c WHERE c.period_id = ${alias}.id ORDER BY c.at DESC, c.id DESC LIMIT 1), 'reopen') = 'close'`
}

/**
 * A subquery choosing, inside the batch, the period a fact dated `?` is posted into: the earliest
 * period not closed that ends on or after the date. A late fact for a closed period lands in the
 * next open one and keeps its true date; a close racing the posting cannot let it into a closed one.
 */
export const PERIOD_FOR_DATE = `(SELECT p.id FROM finance_periods p WHERE p.ends_on >= ? AND NOT ${closedSql('p')} ORDER BY p.starts_on LIMIT 1)`

export interface PeriodState { id: string, label: string, startsOn: string, endsOn: string, closed: boolean }

export async function listPeriods(): Promise<PeriodState[]> {
  const rows = await all<PeriodRow & { closed: number }>(`SELECT p.*, ${closedSql('p')} AS closed FROM finance_periods p ORDER BY p.starts_on`)
  return rows.map(r => ({ id: r.id, label: r.label, startsOn: r.starts_on, endsOn: r.ends_on, closed: r.closed === 1 }))
}

export async function getPeriod(id: string): Promise<PeriodState | null> {
  const r = await first<PeriodRow & { closed: number }>(`SELECT p.*, ${closedSql('p')} AS closed FROM finance_periods p WHERE p.id = ?`, id)
  return r ? { id: r.id, label: r.label, startsOn: r.starts_on, endsOn: r.ends_on, closed: r.closed === 1 } : null
}

/** Whether a fact dated `date` (local, YYYY-MM-DD) would be posted into its own period. */
export async function isPeriodOpen(date: string | number): Promise<boolean> {
  const day = typeof date === 'number' ? await localDate(date) : date
  const r = await first<{ closed: number }>(`SELECT ${closedSql('p')} AS closed FROM finance_periods p WHERE p.starts_on <= ? AND p.ends_on >= ?`, day, day)
  return !r || r.closed !== 1
}

/** The finance year, from finance.year.starts, that holds a London date: a department budget's year (Budgets, BC-06). */
export async function financeYearOf(date: string): Promise<{ startsOn: string, endsOn: string }> {
  return periodContaining(date, YEAR, await useSetting('finance.year.starts') as string)
}
