// Find a time (S7, rules F1 to F5): the people of the chosen groups the viewer plans for, each one's
// levels per day with commitments elsewhere, the chosen rooms' taken times, and the best times.
import { sql } from 'drizzle-orm'
import { refuse, theatreTimeZone, useDb, useSetting, type Actor } from '#kit'
import { instantOfLocal, localDateOf, localParts, nowMs } from '#kit/clock'
import { occupancy } from '#modules/occupancy'
import { addDays, type Commitment } from '../shared/grid'
import { bestTimes, overlay, type Slot, type Span, type Under18, type Week } from '../shared/find'
import { minutesOf, type Unmarked } from '../shared/levels'
import { resolveDay } from './levels'
import { PEOPLE_MAX, plannable } from './planning'
import { rowsOf } from './reading'
import { commitmentsOf, localSpans } from './commitments'
import { under18 } from './safeguarding'

export const DAYS_MAX = 62 // not-policy: rule F2's widest window
export const MUST_MAX = 30 // not-policy: rule F1's ceiling on must-have people
const OCCUPANCY_DAYS = 31 // not-policy: occupancy's own window per call (O3)

export interface FindInput { groupIds: string[], accountIds: string[], must: string[], from: string, to: string, hoursFrom: string, hoursTo: string, length: number, spaceIds: string[], roomOptional: boolean }

export interface FindResult {
  dates: string[]
  step: number
  people: { id: string, name: string, must: boolean }[]
  hidden: number
  weeks: Record<string, Week>
  taken: Record<string, (Span & { label: string | null })[]>
  best: Slot[]
  under18: Under18
}

function datesOf(from: string, to: string): string[] {
  const out = [from]
  while (out.at(-1)! < to) out.push(addDays(out.at(-1)!, 1))
  return out
}

/** F1: everyone in the groups and the people named, each through plannable so nobody slips in. */
export async function peopleOf(viewer: Actor, input: Pick<FindInput, 'groupIds' | 'accountIds'>): Promise<{ ids: string[], hidden: number, reasons: Set<string> }> {
  const ids = new Set<string>()
  const reasons = new Set<string>()
  let hidden = 0
  for (const groupId of input.groupIds) {
    const p = await plannable(viewer, { groupId })
    p.people.forEach(id => ids.add(id))
    p.reasons.forEach(id => reasons.add(id))
  }
  if (input.accountIds.length) {
    const p = await plannable(viewer, { accountIds: input.accountIds })
    p.people.forEach(id => ids.add(id))
    p.reasons.forEach(id => reasons.add(id))
    hidden = p.hidden
  }
  if (ids.size > PEOPLE_MAX) refuse('availability.too-many', `At most ${PEOPLE_MAX} people at once.`, { status: 422 })
  return { ids: [...ids], hidden, reasons }
}

/** An instant range cut at local midnights into each date's stretch, in local minutes. */
/** F5: each date's stretches where a chosen space is taken, in local minutes. */
async function takenTimes(spaceIds: string[], dates: string[], zone: string, viewer: Actor): Promise<FindResult['taken']> {
  const out: FindResult['taken'] = {}
  if (!spaceIds.length) return out
  for (let i = 0; i < dates.length; i += OCCUPANCY_DAYS) {
    const chunk = dates.slice(i, i + OCCUPANCY_DAYS)
    const from = instantOfLocal(chunk[0]!, '00:00', zone)
    const to = instantOfLocal(addDays(chunk.at(-1)!, 1), '00:00', zone)
    for (const space of await occupancy({ spaceIds, from, to }, viewer)) {
      for (const item of space.items) {
        for (const s of localSpans(Math.max(item.from, from), Math.min(item.to, to), zone)) (out[s.date] ??= []).push({ start: s.start, end: s.end, label: item.label })
      }
    }
  }
  return out
}

/** F4: commitments over each person's days, firm as busy and tentative as maybe. */
async function addCommitments(weeks: Record<string, Week>, ids: string[], dates: string[], zone: string): Promise<void> {
  const all = await commitmentsOf(ids, dates, zone)
  for (const [accountId, days] of Object.entries(all)) {
    for (const [date, held] of Object.entries(days)) addHeld(weeks[accountId], date, held)
  }
}

function addHeld(week: Week | undefined, date: string, held: Commitment[]): void {
  if (!week?.[date]) return
  for (const h of held) week[date] = overlay(week[date]!, h, h.firm ? 'busy' : 'maybe', h.labelKey)
}

export async function findTime(viewer: Actor, input: FindInput): Promise<FindResult> {
  if (input.to < input.from || datesOf(input.from, input.to).length > DAYS_MAX) refuse('availability.window', `At most ${DAYS_MAX} days at once.`, { status: 422 })
  const step = Number(await useSetting('availability.grid.step'))
  const hours = { start: minutesOf(input.hoursFrom), end: minutesOf(input.hoursTo) }
  if (hours.end <= hours.start || hours.start % step || hours.end % step) refuse('availability.hours', 'The hours must run forwards on the grid step.', { status: 422 })
  if (input.length % step || input.length < step || input.length > hours.end - hours.start) refuse('availability.length', 'The length must fit the hours on the grid step.', { status: 422 })
  if (input.must.length > MUST_MAX) refuse('availability.too-many-must', `At most ${MUST_MAX} must-have people.`, { status: 422 })

  const dates = datesOf(input.from, input.to)
  const zone = await theatreTimeZone()
  const { ids, hidden, reasons } = await peopleOf(viewer, input)
  const rows = await rowsOf(ids, input.from, input.to)
  const fallback = await useSetting('availability.entry.unmarked-default') as Unmarked
  const weeks: Record<string, Week> = {}
  for (const id of ids) {
    const r = rows.get(id)!
    const mayRead = id === viewer.accountId || reasons.has(id)
    weeks[id] = Object.fromEntries(dates.map(d => [d, resolveDay(d, r.lines, r.exceptions, r.unmarked ?? fallback, e => id === viewer.accountId || (mayRead && e.reasonShared))]))
  }
  await addCommitments(weeks, ids, dates, zone)
  const names = ids.length
    ? await useDb().all<{ id: string, name: string | null }>(sql`SELECT id, name FROM core_accounts WHERE id IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`)
    : []
  const must = input.must.filter(id => ids.includes(id))
  const taken = await takenTimes(input.spaceIds, dates, zone, viewer)
  const now = nowMs()
  const after = { date: localDateOf(now, zone), minute: localParts(now, zone).hour * 60 + localParts(now, zone).minute } // not-policy: minutes in an hour
  return {
    dates,
    step,
    people: names.map(n => ({ id: n.id, name: n.name ?? '', must: must.includes(n.id) })).sort((a, b) => a.name.localeCompare(b.name)),
    hidden,
    weeks,
    taken,
    best: bestTimes({ dates, people: ids, must, weeks, step, hours, length: input.length, taken, roomOptional: input.roomOptional, after }),
    under18: await under18(ids, dates),
  }
}
