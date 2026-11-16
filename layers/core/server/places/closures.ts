// Closures (part 2, group 2; C-18): times when the whole theatre, a venue or one space is shut. A
// blocking closure refuses a performance scheduled inside it; a public holiday (C-19, imported
// later from core.holiday-feed) only warns. An all-day closure runs over whole operating days, so
// a show that ends at 00:30 belongs to the evening it started, as everywhere else.
// Listing the performances a new closure covers, as a warning, arrives with the programme slice.
import { sql, type SQL } from 'drizzle-orm'
import { all, first, newId, nowMs, refuse } from '#kit'
import type { UnitView } from '#kit'
import { instantOfLocal } from '#kit/clock'
import { dayBounds, dayRule } from '../calendar'

export interface Closure {
  id: string
  venueId: string | null
  spaceId: string | null
  kind: 'closure' | 'public_holiday'
  title: string
  startsAt: number
  endsAt: number
  allDay: boolean
  blocksPerformances: boolean
  source: 'manual' | 'feed'
}

export interface ClosureInput {
  venueId?: string | null
  spaceId?: string | null
  title: string
  /** All day: from and to are dates, YYYY-MM-DD, both included. Otherwise local times, YYYY-MM-DDTHH:mm. */
  allDay: boolean
  from: string
  to: string
  blocksPerformances?: boolean
}

interface ClosureRow { id: string, venue_id: string | null, space_id: string | null, kind: Closure['kind'], title: string, starts_at: number, ends_at: number, all_day: number, blocks_performances: number, source: Closure['source'] }

const toClosure = (r: ClosureRow): Closure => ({
  id: r.id, venueId: r.venue_id, spaceId: r.space_id, kind: r.kind, title: r.title, startsAt: r.starts_at, endsAt: r.ends_at,
  allDay: !!r.all_day, blocksPerformances: !!r.blocks_performances, source: r.source,
})

/** The instants a closure covers, in the theatre's time zone. */
async function period(input: ClosureInput): Promise<{ startsAt: number, endsAt: number }> {
  const rule = await dayRule() ?? refuse('core.locale.time-zone-unset', 'The theatre\'s time zone has not been set yet. Finish setup first.', { status: 409 })
  const bounds = input.allDay
    ? { startsAt: (await dayBounds(input.from)).start, endsAt: (await dayBounds(input.to)).end }
    : { startsAt: instantOfLocal(input.from.slice(0, 10), input.from.slice(11, 16), rule.timeZone), endsAt: instantOfLocal(input.to.slice(0, 10), input.to.slice(11, 16), rule.timeZone) } // not-policy: positions in YYYY-MM-DDTHH:mm
  if (bounds.endsAt <= bounds.startsAt) refuse('core.closure.period', 'The closure must end after it starts.', { status: 422, fields: { to: 'The closure must end after it starts.' } })
  return bounds
}

/** Closures and holidays that overlap [from, to), soonest first. Given a space, only those that reach it. */
export async function closuresBetween(from: number, to: number, options: { venueId?: string, spaceId?: string } = {}): Promise<Closure[]> {
  const params: unknown[] = [to, from]
  let scope = ''
  if (options.spaceId) {
    scope = 'AND (venue_id IS NULL OR (space_id IS NULL AND venue_id = (SELECT venue_id FROM core_spaces WHERE id = ?)) OR space_id = ?)'
    params.push(options.spaceId, options.spaceId)
  }
  else if (options.venueId) {
    scope = 'AND (venue_id IS NULL OR venue_id = ?)'
    params.push(options.venueId)
  }
  return (await all<ClosureRow>(`SELECT * FROM core_closures WHERE starts_at < ? AND ends_at > ? ${scope} ORDER BY starts_at, id`, ...params)).map(toClosure)
}

/**
 * A predicate a caller puts on its own write: no blocking closure covers any of [from, to) in this
 * space, its venue or the whole theatre. Like assertTerm, it goes on the statement, never in a read
 * made beforehand, so it holds against a closure saved at the same moment.
 */
export function assertNoBlockingClosure(spaceId: string | SQL, from: number | SQL, to: number | SQL): SQL {
  return sql`NOT EXISTS (SELECT 1 FROM core_closures c WHERE c.blocks_performances = 1 AND c.starts_at < ${to} AND c.ends_at > ${from}
    AND (c.venue_id IS NULL OR (c.space_id IS NULL AND c.venue_id = (SELECT venue_id FROM core_spaces WHERE id = ${spaceId})) OR c.space_id = ${spaceId}))`
}

export async function createClosure(unit: UnitView, input: ClosureInput, actorId: string | null): Promise<string> {
  const venueId = input.venueId ?? null
  const spaceId = input.spaceId ?? null
  if (spaceId && !venueId) refuse('core.closure.scope', 'Choose the venue the space is in.', { status: 422 })
  if (venueId && !await first('SELECT 1 FROM core_venues WHERE id = ?', venueId)) refuse('core.venue.not-found', 'There is no such venue.', { status: 404 })
  if (spaceId && !await first('SELECT 1 FROM core_spaces WHERE id = ? AND venue_id = ?', spaceId, venueId)) refuse('core.space.not-found', 'There is no such space in this venue.', { status: 404 })
  const { startsAt, endsAt } = await period(input)
  const id = newId('clo')
  const blocks = input.blocksPerformances ?? true
  unit.add(sql`INSERT INTO core_closures (id, venue_id, space_id, kind, title, starts_at, ends_at, all_day, blocks_performances, source, created_by, created_at)
    VALUES (${id}, ${venueId}, ${spaceId}, 'closure', ${input.title}, ${startsAt}, ${endsAt}, ${input.allDay ? 1 : 0}, ${blocks ? 1 : 0}, 'manual', ${actorId}, ${nowMs()})`)
  unit.audit({ action: 'create', record: ['core.closure', id], detail: { venueId, spaceId } })
  unit.announce('core.closure.created', { closureId: id, venueId, spaceId, startsAt, endsAt, blocksPerformances: blocks }, { record: ['core.closure', id] })
  return id
}

/** Deletes a closure the theatre recorded. A public holiday comes from the feed and stays. */
export async function deleteClosure(unit: UnitView, id: string): Promise<void> {
  const row = await first<ClosureRow>('SELECT * FROM core_closures WHERE id = ?', id)
  if (!row) refuse('core.closure.not-found', 'There is no such closure.', { status: 404 })
  if (row.source === 'feed') refuse('core.closure.from-feed', 'Public holidays come from the holiday feed and cannot be deleted here.', { status: 409 })
  unit.add(sql`DELETE FROM core_closures WHERE id = ${id}`).expect(1)
  unit.audit({ action: 'delete', record: ['core.closure', id], detail: { venueId: row.venue_id, spaceId: row.space_id } })
  unit.announce('core.closure.removed', { closureId: id, venueId: row.venue_id, spaceId: row.space_id, startsAt: row.starts_at, endsAt: row.ends_at, blocksPerformances: !!row.blocks_performances }, { record: ['core.closure', id] })
}
