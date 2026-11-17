// Shared set-up for the front of house tests: scheduled performances made through the core's own
// routes, duties and shifts made through front of house's.
import { expect } from 'vitest'
import { changeSetting, createUnit, fact, newId, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import createProduction from '../../../core/server/api/core/productions/index.post'
import addPerformance from '../../../core/server/api/core/productions/[id]/performances/index.post'
import schedulePerformance from '../../../core/server/api/core/performances/[id]/schedule.post'
import patchPerformance from '../../../core/server/api/core/performances/[id]/index.patch'
import cancelPerformance from '../../../core/server/api/core/performances/[id]/cancel.post'
import createVenue from '../../../core/server/api/core/venues/index.post'
import dutiesPost from '../../server/api/front-of-house/duties/index.post'
import dutiesGet from '../../server/api/front-of-house/duties/index.get'
import dutyPut from '../../server/api/front-of-house/duties/[id]/index.put'
import dutyArchive from '../../server/api/front-of-house/duties/[id]/archive.post'
import templatesGet from '../../server/api/front-of-house/rota-templates/index.get'
import templatesPost from '../../server/api/front-of-house/rota-templates/index.post'
import templatePut from '../../server/api/front-of-house/rota-templates/[id]/index.put'
import templateArchive from '../../server/api/front-of-house/rota-templates/[id]/archive.post'
import templateApply from '../../server/api/front-of-house/rota-templates/[id]/apply.post'
import shiftsPost from '../../server/api/front-of-house/performances/[id]/shifts/index.post'
import shiftsGet from '../../server/api/front-of-house/performances/[id]/shifts/index.get'
import shiftsApply from '../../server/api/front-of-house/performances/[id]/shifts/apply.post'
import shiftsPublishAll from '../../server/api/front-of-house/performances/[id]/shifts/publish.post'
import occasionPost from '../../server/api/front-of-house/shifts/index.post'
import bulkPublish from '../../server/api/front-of-house/shifts/publish.post'
import shiftPatch from '../../server/api/front-of-house/shifts/[id]/index.patch'
import publishPost from '../../server/api/front-of-house/shifts/[id]/publish.post'
import unpublishPost from '../../server/api/front-of-house/shifts/[id]/unpublish.post'
import cancelPost from '../../server/api/front-of-house/shifts/[id]/cancel.post'
import signUpPost from '../../server/api/front-of-house/shifts/[id]/sign-up.post'
import { call, env, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'

export const handle = server({
  'POST /api/core/productions': createProduction,
  'POST /api/core/productions/:id/performances': addPerformance,
  'POST /api/core/performances/:id/schedule': schedulePerformance,
  'PATCH /api/core/performances/:id': patchPerformance,
  'POST /api/core/performances/:id/cancel': cancelPerformance,
  'POST /api/core/venues': createVenue,
  'POST /api/front-of-house/duties': dutiesPost,
  'GET /api/front-of-house/duties': dutiesGet,
  'PUT /api/front-of-house/duties/:id': dutyPut,
  'POST /api/front-of-house/duties/:id/archive': dutyArchive,
  'GET /api/front-of-house/rota-templates': templatesGet,
  'POST /api/front-of-house/rota-templates': templatesPost,
  'PUT /api/front-of-house/rota-templates/:id': templatePut,
  'POST /api/front-of-house/rota-templates/:id/archive': templateArchive,
  'POST /api/front-of-house/rota-templates/:id/apply': templateApply,
  'POST /api/front-of-house/performances/:id/shifts': shiftsPost,
  'GET /api/front-of-house/performances/:id/shifts': shiftsGet,
  'POST /api/front-of-house/performances/:id/shifts/apply': shiftsApply,
  'POST /api/front-of-house/performances/:id/shifts/publish': shiftsPublishAll,
  'POST /api/front-of-house/shifts': occasionPost,
  'POST /api/front-of-house/shifts/publish': bulkPublish,
  'PATCH /api/front-of-house/shifts/:id': shiftPatch,
  'POST /api/front-of-house/shifts/:id/publish': publishPost,
  'POST /api/front-of-house/shifts/:id/unpublish': unpublishPost,
  'POST /api/front-of-house/shifts/:id/cancel': cancelPost,
  'POST /api/front-of-house/shifts/:id/sign-up': signUpPost,
})

export type Person = ReturnType<typeof person>

export const manager = person(['core.production.create', 'core.performance.schedule', 'core.performance.cancel', 'core.venue.manage', 'front-of-house.duty.manage', 'front-of-house.shift.manage'])
export const volunteer = (): Person => person(['front-of-house.shift.sign-up'])

export const NOV_16 = Date.UTC(2026, 10, 16, 12)
export const MINUTE = 60_000
let keys = 0
let dutyCount = 0

export async function req<T = any>(method: string, path: string, body?: unknown, actor: Person = manager): Promise<{ status: number, body: T }> {
  const headers = method === 'POST' ? { 'idempotency-key': `foh${++keys}-${newId('req')}` } : undefined
  const response = await call(handle, method, path, { actor, body, headers })
  return { status: response.status, body: await response.json() as T }
}

export async function setting(key: string, value: unknown): Promise<void> {
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), key, value, { reason: 'test', confirm: true })
    await unit.commit()
  })
}

/** Switches the module on and sets the time zone. */
export async function ready(): Promise<void> {
  ;(env as any).CORE_TURNSTILE_SECRET_KEY = ''
  await setModule('front-of-house', true)
  await setting('core.locale.time-zone', 'Europe/London')
}

export interface Made { id: string, startsAt: number, endsAt: number, venueId: string, spaceId: string }

let n = 0
/** A scheduled performance, starting at 19:30 on a day in 2027. */
export async function performance(): Promise<Made> {
  n++
  resetRateLimits()
  setClock(NOV_16)
  const production = await req('POST', '/api/core/productions', { title: `Front of house show ${n}`, kind: 'own' })
  const venue = await req('POST', '/api/core/venues', { name: `Front of house venue ${n}` })
  const startsAt = Date.UTC(2027, n % 12, n % 28 + 1, 19, 30)
  const made = await req('POST', `/api/core/productions/${production.body.id}/performances`, { venueId: venue.body.venueId, spaceId: venue.body.spaceId, startsAt })
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  expect((await req('POST', `/api/core/performances/${made.body.id}/schedule`, {})).status).toBe(200)
  const [row] = await rows<{ ends_at: number }>('SELECT ends_at FROM core_performances WHERE id = ?', made.body.id)
  return { id: made.body.id, startsAt, endsAt: row!.ends_at, venueId: venue.body.venueId, spaceId: venue.body.spaceId }
}

export async function duty(name: string, options: { isLead?: boolean, requirements?: string[] } = {}): Promise<string> {
  const made = await req('POST', '/api/front-of-house/duties', { name: `${name} ${++dutyCount}`, callBeforeMinutes: 60, stayAfterMinutes: 30, ...options })
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  return made.body.dutyId
}

export async function shift(performanceId: string, dutyId: string, places = 2, publish = true): Promise<string> {
  const made = await req('POST', `/api/front-of-house/performances/${performanceId}/shifts`, { dutyId, places })
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  if (publish) expect((await req('POST', `/api/front-of-house/shifts/${made.body.shiftId}/publish`, {})).status).toBe(200)
  return made.body.shiftId
}

export const shiftRow = async (id: string) => (await rows<Record<string, number | string | null>>('SELECT * FROM front_of_house_shifts WHERE id = ?', id))[0]!

export const holds = (name: string, actor: Person, record?: readonly [string, string]) => inContext(() => fact(name, actor, record))
