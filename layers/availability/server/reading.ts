// The reads other modules and screens use (spec part 4): levels() and freshness(), each limited to
// the people the viewer may plan for (A7). Rows are read by their owner through the account scope.
import { sql, type SQL } from 'drizzle-orm'
import { nowMs, refuse, theatreTimeZone, useDb, useSetting, type Actor } from '#kit'
import { localDateOf } from '#kit/clock'
import type { Level, ShownLevel, Unmarked } from '../shared/levels'
import { blocksBetween, type ExceptionRow, type LineRow } from './levels'
import { plannable, type Who } from './planning'

const DAY = 86_400_000 // not-policy: unit of time
const WINDOW_DAYS = 62 // not-policy: rule F2's widest window

/** The survivor of a row's account, so rows of merged accounts read as their survivor's. */
const owner = (column: string) => sql.raw(`coalesce((SELECT a.merged_into_id FROM core_accounts a WHERE a.id = ${column}), ${column})`)
const among = (column: string, people: string[]): SQL => sql`${owner(column)} IN (SELECT value FROM json_each(${JSON.stringify(people)}))`

export interface PersonRows { unmarked: Unmarked | null, changedAt: number | null, checkedTo: string | null, lines: LineRow[], exceptions: ExceptionRow[] }

/** Everything the levels of these people over the dates rest on: one read per table. */
export async function rowsOf(people: string[], fromDate: string, toDate: string): Promise<Map<string, PersonRows>> {
  const db = useDb()
  const out = new Map<string, PersonRows>(people.map(p => [p, { unmarked: null, changedAt: null, checkedTo: null, lines: [], exceptions: [] }]))
  if (!people.length) return out
  const profiles = await db.all<{ who: string, unmarked_means: Unmarked | null, changed_at: number, checked_to: string | null }>(
    sql`SELECT ${owner('account_id')} AS who, unmarked_means, changed_at, checked_to FROM availability_profiles WHERE ${among('account_id', people)} ORDER BY changed_at`)
  for (const p of profiles) {
    const r = out.get(p.who)!
    r.unmarked = p.unmarked_means ?? r.unmarked
    r.changedAt = Math.max(r.changedAt ?? 0, p.changed_at)
    r.checkedTo = !r.checkedTo || (p.checked_to && p.checked_to > r.checkedTo) ? p.checked_to : r.checkedTo
  }
  const lines = await db.all<{ who: string, pattern_id: string, starts_on: string, ends_on: string | null, changed: number, weekday: number, from_local: string, until_local: string, level: Level }>(
    sql`SELECT ${owner('p.account_id')} AS who, l.pattern_id, p.starts_on, p.ends_on, p.updated_at AS changed, l.weekday, l.from_local, l.until_local, l.level
      FROM availability_pattern_lines l JOIN availability_patterns p ON p.id = l.pattern_id
      WHERE ${among('p.account_id', people)} AND p.starts_on <= ${toDate} AND (p.ends_on IS NULL OR p.ends_on >= ${fromDate})`)
  for (const l of lines) out.get(l.who)!.lines.push({ patternId: l.pattern_id, startsOn: l.starts_on, endsOn: l.ends_on, changedAt: l.changed, weekday: l.weekday, from: l.from_local, until: l.until_local, level: l.level })
  const exceptions = await db.all<{ who: string, id: string, first_date: string, last_date: string, weekdays: string | null, from_local: string | null, until_local: string | null, level: Level, reason: string | null, reason_shared: number, created_at: number }>(
    sql`SELECT ${owner('account_id')} AS who, id, first_date, last_date, weekdays, from_local, until_local, level, reason, reason_shared, created_at
      FROM availability_exceptions WHERE ${among('account_id', people)} AND first_date <= ${toDate} AND last_date >= ${fromDate}`)
  for (const e of exceptions) {
    out.get(e.who)!.exceptions.push({ id: e.id, firstDate: e.first_date, lastDate: e.last_date, weekdays: e.weekdays ? JSON.parse(e.weekdays) : null, from: e.from_local, until: e.until_local, level: e.level, reason: e.reason, reasonShared: !!e.reason_shared, createdAt: e.created_at })
  }
  return out
}

export interface LevelBlock { accountId: string, from: number, to: number, level: ShownLevel, reason?: string }

/**
 * Levels per rule A4 over [from, to) for each person the viewer may plan for. A reason shows only
 * when shared and read through a group the person is in, or by the person. People left out are
 * counted in `hidden`. A whole team for a week is one call.
 */
export async function levels(who: Who, from: number, to: number, viewer: Actor): Promise<{ blocks: LevelBlock[], hidden: number }> {
  if (to <= from || to - from > WINDOW_DAYS * DAY) refuse('availability.window', `At most ${WINDOW_DAYS} days at once.`, { status: 422 })
  const { people, hidden, reasons } = await plannable(viewer, who)
  const zone = await theatreTimeZone()
  const rows = await rowsOf(people, localDateOf(from, zone), localDateOf(to - 1, zone))
  const fallback = await useSetting('availability.entry.unmarked-default') as Unmarked
  const blocks: LevelBlock[] = []
  for (const accountId of people) {
    const r = rows.get(accountId)!
    const mayRead = accountId === viewer.accountId || reasons.has(accountId)
    for (const b of blocksBetween({ from, to, zone, lines: r.lines, exceptions: r.exceptions, unmarked: r.unmarked ?? fallback, showReason: e => accountId === viewer.accountId || (mayRead && e.reasonShared) }))
      blocks.push({ accountId, ...b })
  }
  return { blocks, hidden }
}

/** When each person last changed anything, and how far they have checked (part 4). */
export async function freshness(who: Who, viewer: Actor): Promise<{ people: { accountId: string, changedAt: number | null, checkedTo: string | null }[], hidden: number }> {
  const { people, hidden } = await plannable(viewer, who)
  const today = localDateOf(nowMs(), await theatreTimeZone())
  const rows = await rowsOf(people, today, today)
  return { people: people.map(p => ({ accountId: p, changedAt: rows.get(p)!.changedAt, checkedTo: rows.get(p)!.checkedTo })), hidden }
}
