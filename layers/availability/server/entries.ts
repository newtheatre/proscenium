// A person's own availability (rules A1 to A3, A6): weekly patterns and their lines, dated exceptions
// and what unmarked time means. Each save touches the profile and announces the dates it changes.
import { sql } from 'drizzle-orm'
import { inAccountScope, newId, nowMs, refuse, theatreTimeZone, useDb, useSetting, type UnitView } from '#kit'
import { localDateOf } from '#kit/clock'
import { minutesOf, onStep, type Level, type Unmarked } from '../shared/levels'
import { nextDate } from './levels'

const SECOND = 1000 // not-policy: settings are whole seconds
const FOREVER = '9999-12-31' // not-policy: an open end, for comparing dates

export interface LineInput { weekday: number, from: string, until: string, level: Level }
export interface PatternInput { label: string, startsOn: string, endsOn: string | null }
export interface ExceptionInput { firstDate: string, lastDate: string, weekdays: number[] | null, from: string | null, until: string | null, level: Level, reason: string | null, reasonShared: boolean }

/** Today in the theatre, an ordinary day (not the show night), and the last date entries may reach (A3). */
export async function entryDates(): Promise<{ today: string, horizon: string }> {
  const zone = await theatreTimeZone()
  const at = nowMs()
  const ahead = (await useSetting('availability.entry.horizon') as number) * SECOND
  return { today: localDateOf(at, zone), horizon: localDateOf(at + ahead, zone) }
}

/** A6: the profile's changed_at moves, and the dates touched are announced, with no levels or reasons. */
export function touched(unit: UnitView, accountId: string, from: string, to: string): void {
  const at = nowMs()
  unit.add(sql`INSERT INTO availability_profiles (account_id, changed_at, created_at, updated_at) VALUES (${accountId}, ${at}, ${at}, ${at})
    ON CONFLICT (account_id) DO UPDATE SET changed_at = excluded.changed_at, updated_at = excluded.updated_at`)
  unit.announce('availability.entry.updated', { accountId, from, to }, { record: ['core.account', accountId] })
}

async function step(): Promise<number> {
  return Number(await useSetting('availability.grid.step'))
}

/** A2: every time on the grid step, each line ending after it starts, and lines of a weekday apart. */
export async function checkLines(lines: LineInput[]): Promise<void> {
  const grid = await step()
  for (const l of lines) {
    if (!onStep(l.from, grid) || !onStep(l.until, grid)) refuse('availability.off-step', `Times start and end on the ${grid}-minute mark.`, { status: 422 })
    if (minutesOf(l.until) <= minutesOf(l.from)) refuse('availability.backwards', 'Each time must end after it starts.', { status: 422 })
  }
  for (const a of lines) {
    for (const b of lines) {
      if (a !== b && a.weekday === b.weekday && minutesOf(a.from) < minutesOf(b.until) && minutesOf(b.from) < minutesOf(a.until))
        refuse('availability.lines-overlap', 'Two times on the same day overlap.', { status: 422, remedy: 'Join them, or move one.' })
    }
  }
}

const noOverlap = (accountId: string, startsOn: string, endsOn: string | null, except: string | null) => sql`NOT EXISTS (SELECT 1 FROM availability_patterns o
  WHERE ${inAccountScope('o.account_id', accountId)} AND o.id IS NOT ${except} AND o.starts_on <= ${endsOn ?? FOREVER} AND coalesce(o.ends_on, ${FOREVER}) >= ${startsOn})`

async function clashName(accountId: string, p: PatternInput, except: string | null): Promise<string | null> {
  const [row] = await useDb().all<{ label: string }>(sql`SELECT label FROM availability_patterns o WHERE ${inAccountScope('o.account_id', accountId)} AND o.id IS NOT ${except}
    AND o.starts_on <= ${p.endsOn ?? FOREVER} AND coalesce(o.ends_on, ${FOREVER}) >= ${p.startsOn} LIMIT 1`)
  return row?.label ?? null
}

/** A2: two patterns of one person never share a date. Refused naming the one in the way. */
async function checkPattern(accountId: string, p: PatternInput, except: string | null): Promise<void> {
  if (p.endsOn && p.endsOn < p.startsOn) refuse('availability.backwards', 'A pattern must end on or after the day it starts.', { status: 422 })
  const clash = await clashName(accountId, p, except)
  if (clash) refuse('availability.patterns-overlap', `These dates overlap your pattern "${clash}".`, { status: 409, remedy: 'Change its dates first.' })
}

const OVERLAP = { code: 'availability.patterns-overlap', reason: 'These dates overlap another of your patterns.', remedy: 'Change its dates first.' }

function writeLines(unit: UnitView, patternId: string, lines: LineInput[]): void {
  unit.add(sql`DELETE FROM availability_pattern_lines WHERE pattern_id = ${patternId}`)
  if (!lines.length) return
  const rows = lines.map(l => ({ id: newId('avpl'), w: l.weekday, f: l.from, u: l.until, v: l.level }))
  const at = nowMs()
  unit.add(sql`INSERT INTO availability_pattern_lines (id, pattern_id, weekday, from_local, until_local, level, created_at, updated_at)
    SELECT json_extract(value, '$.id'), ${patternId}, json_extract(value, '$.w'), json_extract(value, '$.f'), json_extract(value, '$.u'), json_extract(value, '$.v'), ${at}, ${at}
    FROM json_each(${JSON.stringify(rows)})`)
}

export async function createPattern(unit: UnitView, accountId: string, p: PatternInput, lines: LineInput[]): Promise<string> {
  await checkPattern(accountId, p, null)
  await checkLines(lines)
  const id = newId('avpt')
  const at = nowMs()
  unit.add(sql`INSERT INTO availability_patterns (id, account_id, label, starts_on, ends_on, created_at, updated_at)
    SELECT ${id}, ${accountId}, ${p.label}, ${p.startsOn}, ${p.endsOn}, ${at}, ${at} WHERE ${noOverlap(accountId, p.startsOn, p.endsOn, null)}`).expect(1, OVERLAP)
  writeLines(unit, id, lines)
  touched(unit, accountId, p.startsOn, p.endsOn ?? (await entryDates()).horizon)
  return id
}

interface PatternRow { id: string, account_id: string, starts_on: string, ends_on: string | null }

/** The person's own pattern, or a refusal that says nothing about anyone else's (A1). */
export async function ownPattern(accountId: string, id: string): Promise<PatternRow> {
  const [row] = await useDb().all<PatternRow>(sql`SELECT id, account_id, starts_on, ends_on FROM availability_patterns WHERE id = ${id} AND ${inAccountScope('account_id', accountId)}`)
  return row ?? refuse('availability.pattern.not-found', 'There is no such pattern of yours.', { status: 404 })
}

/** Renames or re-dates a pattern, and replaces its lines when given. */
export async function updatePattern(unit: UnitView, accountId: string, id: string, p: PatternInput, lines: LineInput[] | null): Promise<void> {
  const was = await ownPattern(accountId, id)
  await checkPattern(accountId, p, id)
  if (lines) await checkLines(lines)
  unit.add(sql`UPDATE availability_patterns SET label = ${p.label}, starts_on = ${p.startsOn}, ends_on = ${p.endsOn}, updated_at = ${nowMs()}
    WHERE id = ${id} AND ${noOverlap(accountId, p.startsOn, p.endsOn, id)}`).expect(1, OVERLAP)
  if (lines) writeLines(unit, id, lines)
  const horizon = (await entryDates()).horizon
  touched(unit, accountId, was.starts_on < p.startsOn ? was.starts_on : p.startsOn, [was.ends_on ?? horizon, p.endsOn ?? horizon].sort().at(-1)!)
}

export async function deletePattern(unit: UnitView, accountId: string, id: string): Promise<void> {
  const was = await ownPattern(accountId, id)
  unit.add(sql`DELETE FROM availability_pattern_lines WHERE pattern_id = ${id}`)
  unit.add(sql`DELETE FROM availability_patterns WHERE id = ${id}`).expect(1, { code: 'availability.pattern.not-found', reason: 'That pattern has gone.' })
  touched(unit, accountId, was.starts_on, was.ends_on ?? (await entryDates()).horizon)
}

/** A3 and the shape rules for an exception: from today, within the horizon, at most 366 days. */
export async function checkException(e: ExceptionInput): Promise<void> {
  const { today, horizon } = await entryDates()
  if (e.lastDate < e.firstDate) refuse('availability.backwards', 'The last day must be on or after the first.', { status: 422 })
  if (e.firstDate < today) refuse('availability.past', 'Days before today cannot be changed.', { status: 422 })
  if (e.lastDate > horizon) refuse('availability.too-far', 'That is further ahead than availability can be entered.', { status: 422 })
  if ((e.from === null) !== (e.until === null)) refuse('availability.times-pair', 'Give both times, or neither for the whole day.', { status: 422 })
  if (e.from && e.until) await checkLines([{ weekday: 1, from: e.from, until: e.until, level: e.level }])
}

export async function createException(unit: UnitView, accountId: string, enteredBy: string, e: ExceptionInput, requestId: string | null = null): Promise<string> {
  await checkException(e)
  const id = newId('avex')
  const at = nowMs()
  unit.add(sql`INSERT INTO availability_exceptions (id, account_id, first_date, last_date, weekdays, from_local, until_local, level, reason, reason_shared, entered_by, request_id, created_at, updated_at)
    VALUES (${id}, ${accountId}, ${e.firstDate}, ${e.lastDate}, ${e.weekdays ? JSON.stringify([...new Set(e.weekdays)].sort()) : null}, ${e.from}, ${e.until}, ${e.level},
      ${e.reason?.trim() || null}, ${e.reasonShared ? 1 : 0}, ${enteredBy}, ${requestId}, ${at}, ${at})`)
  touched(unit, accountId, e.firstDate, e.lastDate)
  return id
}

interface ExceptionRowSql { id: string, first_date: string, last_date: string }

async function ownException(accountId: string, id: string): Promise<ExceptionRowSql> {
  const [row] = await useDb().all<ExceptionRowSql>(sql`SELECT id, first_date, last_date FROM availability_exceptions WHERE id = ${id} AND ${inAccountScope('account_id', accountId)}`)
  return row ?? refuse('availability.exception.not-found', 'There is no such entry of yours.', { status: 404 })
}

/** Removes an entry. One that began before today keeps its past days, ending yesterday (A3). */
export async function deleteException(unit: UnitView, accountId: string, id: string): Promise<void> {
  const was = await ownException(accountId, id)
  const { today } = await entryDates()
  if (was.last_date < today) refuse('availability.past', 'Days before today cannot be changed.', { status: 422 })
  if (was.first_date < today) {
    let yesterday = was.first_date
    while (nextDate(yesterday) < today) yesterday = nextDate(yesterday)
    unit.add(sql`UPDATE availability_exceptions SET last_date = ${yesterday}, updated_at = ${nowMs()} WHERE id = ${id}`).expect(1)
  }
  else {
    unit.add(sql`DELETE FROM availability_exceptions WHERE id = ${id}`).expect(1, { code: 'availability.exception.not-found', reason: 'That entry has gone.' })
  }
  touched(unit, accountId, today > was.first_date ? today : was.first_date, was.last_date)
}

/** What the person's unmarked time means; null follows the theatre's default. */
export async function setUnmarked(unit: UnitView, accountId: string, means: Unmarked | null): Promise<void> {
  const at = nowMs()
  unit.add(sql`INSERT INTO availability_profiles (account_id, unmarked_means, changed_at, created_at, updated_at) VALUES (${accountId}, ${means}, ${at}, ${at}, ${at})
    ON CONFLICT (account_id) DO UPDATE SET unmarked_means = excluded.unmarked_means, changed_at = excluded.changed_at, updated_at = excluded.updated_at`)
  const { today, horizon } = await entryDates()
  unit.announce('availability.entry.updated', { accountId, from: today, to: horizon }, { record: ['core.account', accountId] })
}
