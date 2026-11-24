// Shared set-up for the room booking tests: the module on, a venue with a space, bookables and
// purposes written as setup would, and a way to try a write and see what it answered.
import { expect } from 'vitest'
import { changeSetting, createUnit, isRefusal, newId, setClock, type UnitView } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import createProduction from '../../../core/server/api/core/productions/index.post'
import addPerformance from '../../../core/server/api/core/productions/[id]/performances/index.post'
import schedulePerformance from '../../../core/server/api/core/performances/[id]/schedule.post'
import createVenue from '../../../core/server/api/core/venues/index.post'
import createClosure from '../../../core/server/api/core/closures/index.post'
import { getBookable, getBooking, type Bookable, type Booking } from '../../server/bookings'

export const core = server({
  'POST /api/core/productions': createProduction,
  'POST /api/core/productions/:id/performances': addPerformance,
  'POST /api/core/performances/:id/schedule': schedulePerformance,
  'POST /api/core/venues': createVenue,
  'POST /api/core/closures': createClosure,
})

export const NOV_24 = Date.UTC(2026, 10, 24, 9)
export const HOUR = 3_600_000
/** A Tuesday in January 2027, 00:00 in London (no clock change near it). */
export const JAN_12 = Date.UTC(2027, 0, 12)
export const at = (hour: number, minute = 0) => JAN_12 + hour * HOUR + minute * 60_000

const admin = person(['core.production.create', 'core.performance.schedule', 'core.venue.manage', 'core.closure.manage'])

export async function coreReq<T = any>(method: string, path: string, body?: unknown): Promise<{ status: number, body: T }> {
  const response = await call(core, method, path, { actor: admin, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as T }
}

export async function ready(): Promise<void> {
  setClock(NOV_24)
  resetRateLimits()
  await setModule('spaces', true)
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true })
    await unit.commit()
  })
}

let n = 0
/** A new venue and its first space. */
export async function place(): Promise<{ venueId: string, spaceId: string }> {
  const made = await coreReq('POST', '/api/core/venues', { name: `Spaces venue ${++n}` })
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  return made.body
}

/** A bookable for a space, or a resource kept at a venue, written as setup would. */
export async function bookable(of: { spaceId: string } | { resource: string, homeVenueId?: string | null }): Promise<Bookable> {
  const id = newId('bkb')
  const at = Date.now()
  if ('spaceId' in of) await rows('INSERT INTO spaces_bookables (id, kind, space_id, control, created_at, updated_at) VALUES (?, \'space\', ?, \'own\', ?, ?)', id, of.spaceId, at, at)
  else await rows('INSERT INTO spaces_bookables (id, kind, name, home_venue_id, control, created_at, updated_at) VALUES (?, \'resource\', ?, ?, \'own\', ?, ?)', id, of.resource, of.homeVenueId ?? null, at, at)
  return (await inContext(() => getBookable(id)))!
}

export async function purpose(tier = 5, fields: Record<string, unknown> = {}): Promise<string> {
  const id = newId('bpu')
  const at = Date.now()
  const slug = `purpose-${++n}`
  await rows('INSERT INTO spaces_purposes (id, slug, name, tier, open_to, approval, can_be_bumped, created_at, updated_at) VALUES (?, ?, ?, ?, \'bookers\', ?, ?, ?, ?)',
    id, slug, `Purpose ${n}`, tier, fields.approval ?? 'automatic', fields.canBeBumped === false ? 0 : 1, at, at)
  return id
}

/** Runs one write in its own unit and answers 'ok' or the refusal's code. */
export async function attempt(write: (unit: UnitView) => unknown | Promise<unknown>): Promise<string> {
  try {
    await inContext(async () => {
      const unit = createUnit()
      await write(unit.view())
      await unit.commit()
    })
    return 'ok'
  }
  catch (error) {
    if (isRefusal(error)) return (error as any).code
    throw error
  }
}

export const booking = (id: string): Promise<Booking> => inContext(async () => (await getBooking(id))!)
export const member = () => newId('acc')
