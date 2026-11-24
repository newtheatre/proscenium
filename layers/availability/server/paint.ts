// Painting on My availability (AV-04): one stroke over part of one day, written as an entry for that
// day or as a change to the pattern covering it. Clear takes back what was painted there.
import { sql } from 'drizzle-orm'
import { inAccountScope, newId, nowMs, refuse, useDb, type UnitView } from '#kit'
import { clockOf as clock, DAY_MINUTES, repaint, spanOf, without, type Span } from '../shared/grid'
import type { Level } from '../shared/levels'
import { checkLines, entryDates, touched, updatePattern, type LineInput } from './entries'
import { nextDate, weekdayOf } from './levels'

export interface Stroke { date: string, from: string | null, until: string | null, level: Level | 'clear', target: 'days' | 'pattern' }

interface ExceptionRow { id: string, first_date: string, last_date: string, weekdays: string | null, from_local: string | null, until_local: string | null, level: Level, reason: string | null, reason_shared: number, entered_by: string, request_id: string | null, created_at: number }

const dayBefore = (date: string) => new Date(Date.parse(`${date}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10) // not-policy: a day

/**
 * Takes the stroke out of the person's entries on that day. An entry over several days keeps its
 * other days; each piece keeps the entry's created_at, so which entry wins (A4) does not change.
 */
function clearDay(unit: UnitView, accountId: string, date: string, cut: Span, rows: ExceptionRow[]): void {
  const weekday = weekdayOf(date)
  for (const e of rows) {
    const weekdays = e.weekdays ? JSON.parse(e.weekdays) as number[] : null
    if (weekdays && !weekdays.includes(weekday)) continue
    const span = spanOf(e.from_local, e.until_local)
    if (cut.end <= span.start || span.end <= cut.start) continue
    const pieces: { first: string, last: string, span: Span }[] = []
    if (e.first_date < date) pieces.push({ first: e.first_date, last: dayBefore(date), span })
    if (e.last_date > date) pieces.push({ first: nextDate(date), last: e.last_date, span })
    for (const s of without(span, cut)) pieces.push({ first: date, last: date, span: s })
    unit.add(sql`DELETE FROM availability_exceptions WHERE id = ${e.id}`).expect(1, { code: 'availability.changed', reason: 'Your availability changed while you were painting.', remedy: 'Try again.' })
    for (const p of pieces) {
      const whole = p.span.start === 0 && p.span.end === DAY_MINUTES
      unit.add(sql`INSERT INTO availability_exceptions (id, account_id, first_date, last_date, weekdays, from_local, until_local, level, reason, reason_shared, entered_by, request_id, created_at, updated_at)
        VALUES (${newId('avex')}, ${accountId}, ${p.first}, ${p.last}, ${e.weekdays}, ${whole ? null : clock(p.span.start)}, ${whole ? null : clock(p.span.end)}, ${e.level}, ${e.reason}, ${e.reason_shared}, ${e.entered_by}, ${e.request_id}, ${e.created_at}, ${e.created_at})`)
    }
  }
}

async function paintPattern(unit: UnitView, accountId: string, s: Stroke, cut: Span): Promise<void> {
  const [p] = await useDb().all<{ id: string, label: string, starts_on: string, ends_on: string | null }>(sql`SELECT id, label, starts_on, ends_on FROM availability_patterns
    WHERE ${inAccountScope('account_id', accountId)} AND starts_on <= ${s.date} AND (ends_on IS NULL OR ends_on >= ${s.date}) ORDER BY updated_at DESC LIMIT 1`)
  if (!p) refuse('availability.pattern.none', 'No pattern of yours covers this day.', { status: 409, remedy: 'Paint just this week, or add a pattern first.' })
  const lines = await useDb().all<LineInput>(sql`SELECT weekday, from_local AS "from", until_local AS "until", level FROM availability_pattern_lines WHERE pattern_id = ${p.id}`)
  await updatePattern(unit, accountId, p.id, { label: p.label, startsOn: p.starts_on, endsOn: p.ends_on }, repaint(lines, weekdayOf(s.date), cut, s.level))
}

/** One stroke: checked against the grid and the dates people may change (A2, A3), then written. */
export async function paint(unit: UnitView, accountId: string, s: Stroke): Promise<void> {
  const { today, horizon } = await entryDates()
  if (s.date < today) refuse('availability.past', 'Days before today cannot be changed.', { status: 422 })
  if (s.date > horizon) refuse('availability.too-far', 'That is further ahead than availability can be entered.', { status: 422 })
  if ((s.from === null) !== (s.until === null)) refuse('availability.times-pair', 'Give both times, or neither for the whole day.', { status: 422 })
  if (s.from && s.until) await checkLines([{ weekday: 1, from: s.from, until: s.until, level: 'free' }])
  const cut = spanOf(s.from, s.until)
  if (s.target === 'pattern') return await paintPattern(unit, accountId, s, cut)
  const rows = await useDb().all<ExceptionRow>(sql`SELECT * FROM availability_exceptions WHERE ${inAccountScope('account_id', accountId)} AND first_date <= ${s.date} AND last_date >= ${s.date}`)
  clearDay(unit, accountId, s.date, cut, rows)
  if (s.level !== 'clear') {
    unit.add(sql`INSERT INTO availability_exceptions (id, account_id, first_date, last_date, from_local, until_local, level, reason_shared, entered_by, created_at, updated_at)
      VALUES (${newId('avex')}, ${accountId}, ${s.date}, ${s.date}, ${s.from}, ${s.until}, ${s.level}, 0, ${accountId}, ${nowMs()}, ${nowMs()})`)
  }
  touched(unit, accountId, s.date, s.date)
}
