// The gate stories, FH-01 to FH-04: the shift window is stored on the shift and moves with the
// performance; on-shift holds only for a confirmed person inside the window; leading-shift for a lead
// duty; rostered from the request; and two people taking the last place at once cannot both have it.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, fact, factHolders, newId, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import createProduction from '../../../core/server/api/core/productions/index.post'
import addPerformance from '../../../core/server/api/core/productions/[id]/performances/index.post'
import schedulePerformance from '../../../core/server/api/core/performances/[id]/schedule.post'
import patchPerformance from '../../../core/server/api/core/performances/[id]/index.patch'
import createVenue from '../../../core/server/api/core/venues/index.post'
import dutiesPost from '../../server/api/front-of-house/duties/index.post'
import dutiesGet from '../../server/api/front-of-house/duties/index.get'
import shiftsPost from '../../server/api/front-of-house/performances/[id]/shifts/index.post'
import shiftsGet from '../../server/api/front-of-house/performances/[id]/shifts/index.get'
import publishPost from '../../server/api/front-of-house/shifts/[id]/publish.post'
import signUpPost from '../../server/api/front-of-house/shifts/[id]/sign-up.post'
import { signUp } from '../../server/assignments'
import { call, deliver, env, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'

const handle = server({
  'POST /api/core/productions': createProduction,
  'POST /api/core/productions/:id/performances': addPerformance,
  'POST /api/core/performances/:id/schedule': schedulePerformance,
  'PATCH /api/core/performances/:id': patchPerformance,
  'POST /api/core/venues': createVenue,
  'POST /api/front-of-house/duties': dutiesPost,
  'GET /api/front-of-house/duties': dutiesGet,
  'POST /api/front-of-house/performances/:id/shifts': shiftsPost,
  'GET /api/front-of-house/performances/:id/shifts': shiftsGet,
  'POST /api/front-of-house/shifts/:id/publish': publishPost,
  'POST /api/front-of-house/shifts/:id/sign-up': signUpPost,
})

const manager = person(['core.production.create', 'core.performance.schedule', 'core.venue.manage', 'front-of-house.duty.manage', 'front-of-house.shift.manage'])
const volunteer = () => person(['front-of-house.shift.sign-up'])

const NOV_16 = Date.UTC(2026, 10, 16, 12)
const MINUTE = 60_000
let keys = 0
let dutyCount = 0

async function req<T = any>(method: string, path: string, body?: unknown, actor: ReturnType<typeof person> = manager): Promise<{ status: number, body: T }> {
  const headers = method === 'POST' ? { 'idempotency-key': `foh${++keys}-${newId('req')}` } : undefined
  const response = await call(handle, method, path, { actor, body, headers })
  return { status: response.status, body: await response.json() as T }
}

async function setting(key: string, value: unknown) {
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), key, value, { reason: 'test', confirm: true })
    await unit.commit()
  })
}

let n = 0
/** A scheduled performance, starting at 19:30 on a day in March 2027. */
async function performance(): Promise<{ id: string, startsAt: number, endsAt: number }> {
  n++
  resetRateLimits()
  setClock(NOV_16)
  const production = await req('POST', '/api/core/productions', { title: `Front of house show ${n}`, kind: 'own' })
  const venue = await req('POST', '/api/core/venues', { name: `Front of house venue ${n}` })
  const startsAt = Date.UTC(2027, 2, n, 19, 30)
  const made = await req('POST', `/api/core/productions/${production.body.id}/performances`, { venueId: venue.body.venueId, spaceId: venue.body.spaceId, startsAt })
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  expect((await req('POST', `/api/core/performances/${made.body.id}/schedule`, {})).status).toBe(200)
  const [row] = await rows<{ ends_at: number }>('SELECT ends_at FROM core_performances WHERE id = ?', made.body.id)
  return { id: made.body.id, startsAt, endsAt: row!.ends_at }
}

async function duty(name: string, options: { isLead?: boolean, requirements?: string[] } = {}): Promise<string> {
  const made = await req('POST', '/api/front-of-house/duties', { name: `${name} ${++dutyCount}`, callBeforeMinutes: 60, stayAfterMinutes: 30, ...options })
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  return made.body.dutyId
}

async function shift(performanceId: string, dutyId: string, places = 2, publish = true): Promise<string> {
  const made = await req('POST', `/api/front-of-house/performances/${performanceId}/shifts`, { dutyId, places })
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  if (publish) expect((await req('POST', `/api/front-of-house/shifts/${made.body.shiftId}/publish`, {})).status).toBe(200)
  return made.body.shiftId
}

const shiftRow = async (id: string) => (await rows<Record<string, number | string | null>>('SELECT * FROM front_of_house_shifts WHERE id = ?', id))[0]!

const holds = (name: string, actor: ReturnType<typeof person>, record?: readonly [string, string]) => inContext(() => fact(name, actor, record))

beforeAll(async () => {
  ;(env as any).CORE_TURNSTILE_SECRET_KEY = ''
  await setModule('front-of-house', true)
  await setting('core.locale.time-zone', 'Europe/London')
})

afterEach(() => setClock(undefined))

describe('FH-01: the shift window', () => {
  it('stores the four times on the shift, from the duty and the two settings', async () => {
    const p = await performance()
    const d = await duty('Steward')
    const id = await shift(p.id, d, 2, false)
    const row = await shiftRow(id)
    expect(row.call_at).toBe(p.startsAt - 60 * MINUTE)
    expect(row.ends_at).toBe(p.endsAt + 30 * MINUTE)
    expect(row.window_opens_at).toBe(p.startsAt - 90 * MINUTE)
    expect(row.window_closes_at).toBe(p.endsAt + 90 * MINUTE)
    // Sign-up closes two hours before the call time by default.
    expect(row.sign_up_closes_at).toBe(p.startsAt - 180 * MINUTE)
    expect(row.state).toBe('draft')
  })

  it('does not move shifts that exist when a window setting changes', async () => {
    const p = await performance()
    const id = await shift(p.id, await duty('Bar'), 2, false)
    const before = await shiftRow(id)
    await setting('front-of-house.shifts.window-before', 3600)
    expect((await shiftRow(id)).window_opens_at).toBe(before.window_opens_at)
    // A new shift takes the new setting.
    const later = await shift(p.id, await duty('Usher'), 2, false)
    const row = await shiftRow(later)
    expect(row.window_opens_at).toBe(Number(row.call_at) - 60 * MINUTE)
    await setting('front-of-house.shifts.window-before', 1800)
  })

  it('moves every shift by the same offsets when the performance is rescheduled', async () => {
    const p = await performance()
    const id = await shift(p.id, await duty('Steward'))
    const before = await shiftRow(id)
    const hour = 60 * MINUTE
    const moved = await req('PATCH', `/api/core/performances/${p.id}`, { startsAt: p.startsAt + hour, endsAt: p.endsAt + 2 * hour })
    expect(moved.status, JSON.stringify(moved.body)).toBe(200)
    await deliver()
    const after = await shiftRow(id)
    expect(after.call_at).toBe(Number(before.call_at) + hour)
    expect(after.window_opens_at).toBe(Number(before.window_opens_at) + hour)
    expect(after.sign_up_closes_at).toBe(Number(before.sign_up_closes_at) + hour)
    expect(after.ends_at).toBe(Number(before.ends_at) + 2 * hour)
    expect(after.window_closes_at).toBe(Number(before.window_closes_at) + 2 * hour)
  })

  it('allows one shift per duty per performance', async () => {
    const p = await performance()
    const d = await duty('Steward')
    await shift(p.id, d, 2, false)
    const again = await req('POST', `/api/front-of-house/performances/${p.id}/shifts`, { dutyId: d, places: 1 })
    expect(again.body.code).toBe('front-of-house.shift-exists')
  })
})

describe('FH-02 and FH-03: the facts', () => {
  it('gives on-shift only to a confirmed person, only inside the window', async () => {
    const p = await performance()
    const id = await shift(p.id, await duty('Steward'))
    const ada = volunteer()
    const signed = await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, ada)
    expect(signed.body).toMatchObject({ state: 'confirmed' })
    const row = await shiftRow(id)
    const perf = ['core.performance', p.id] as const

    setClock(Number(row.window_opens_at) - 1)
    expect(await holds('front-of-house.on-shift', ada, perf)).toBe(false)
    // Rostered holds from the sign-up, before the window opens.
    expect(await holds('front-of-house.rostered', ada)).toBe(true)

    setClock(Number(row.window_opens_at))
    expect(await holds('front-of-house.on-shift', ada, perf)).toBe(true)
    // A standing: asked with no record, it holds for any performance.
    expect(await holds('front-of-house.on-shift', ada)).toBe(true)
    // On the shift's own record too, and not on another performance.
    expect(await holds('front-of-house.on-shift', ada, ['front-of-house.shift', id])).toBe(true)
    expect(await holds('front-of-house.on-shift', ada, ['core.performance', newId('prf')])).toBe(false)
    expect(await inContext(() => factHolders('front-of-house.on-shift', perf))).toEqual([ada.accountId])
    // Not a lead duty.
    expect(await holds('front-of-house.leading-shift', ada, perf)).toBe(false)

    setClock(Number(row.window_closes_at))
    expect(await holds('front-of-house.on-shift', ada, perf)).toBe(true)
    setClock(Number(row.window_closes_at) + 1)
    expect(await holds('front-of-house.on-shift', ada, perf)).toBe(false)
    expect(await holds('front-of-house.rostered', ada)).toBe(false)
  })

  it('gives leading-shift to someone on shift in a lead duty', async () => {
    const p = await performance()
    const id = await shift(p.id, await duty('Duty manager', { isLead: true }))
    const lead = volunteer()
    expect((await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, lead)).status).toBe(200)
    setClock(Number((await shiftRow(id)).call_at))
    expect(await holds('front-of-house.leading-shift', lead, ['core.performance', p.id])).toBe(true)
    expect(await inContext(() => factHolders('front-of-house.leading-shift', ['core.performance', p.id]))).toEqual([lead.accountId])
  })

  it('gives a requested assignment rostered but no authority', async () => {
    await setting('front-of-house.shifts.confirmation', 'manager')
    try {
      const p = await performance()
      const id = await shift(p.id, await duty('Steward'))
      const bea = volunteer()
      const signed = await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, bea)
      expect(signed.body).toMatchObject({ state: 'requested' })
      // A requested assignment takes a place.
      expect((await shiftRow(id)).places_taken).toBe(1)
      setClock(Number((await shiftRow(id)).call_at))
      expect(await holds('front-of-house.on-shift', bea, ['core.performance', p.id])).toBe(false)
      expect(await holds('front-of-house.rostered', bea)).toBe(true)
    }
    finally {
      await setting('front-of-house.shifts.confirmation', 'automatic')
    }
  })

  it('holds for nobody while the module is off', async () => {
    const p = await performance()
    const id = await shift(p.id, await duty('Steward'))
    const cal = volunteer()
    await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, cal)
    setClock(Number((await shiftRow(id)).call_at))
    await setModule('front-of-house', false)
    try {
      expect(await holds('front-of-house.on-shift', cal, ['core.performance', p.id])).toBe(false)
    }
    finally {
      await setModule('front-of-house', true)
    }
  })
})

describe('sign-up', () => {
  it('refuses a draft shift, a full one and an overlapping one', async () => {
    const p = await performance()
    const draft = await shift(p.id, await duty('Steward'), 1, false)
    const dee = volunteer()
    expect((await req('POST', `/api/front-of-house/shifts/${draft}/sign-up`, {}, dee)).body.code).toBe('front-of-house.shift-closed')
    expect((await req('POST', `/api/front-of-house/shifts/${draft}/publish`, {})).status).toBe(200)
    expect((await req('POST', `/api/front-of-house/shifts/${draft}/sign-up`, {}, dee)).status).toBe(200)
    // Full now.
    expect((await req('POST', `/api/front-of-house/shifts/${draft}/sign-up`, {}, volunteer())).body.code).toBe('front-of-house.shift-full')
    // Dee is on a shift at that time, so not on a second one at the same performance.
    const other = await shift(p.id, await duty('Bar'))
    expect((await req('POST', `/api/front-of-house/shifts/${other}/sign-up`, {}, dee)).body.code).toBe('front-of-house.shift-overlaps')
  })

  it('refuses once sign-up has closed', async () => {
    const p = await performance()
    const id = await shift(p.id, await duty('Steward'))
    setClock(Number((await shiftRow(id)).sign_up_closes_at))
    expect((await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, volunteer())).body.code).toBe('front-of-house.shift-closed')
  })
})

describe('FH-04: the last place', () => {
  it('goes to one of two people taking it at once', async () => {
    const p = await performance()
    const id = await shift(p.id, await duty('Steward'), 1)
    const [eve, fay] = [volunteer(), volunteer()]
    // Both read a free place before either commits.
    const outcomes = await inContext(async () => {
      const first = createUnit()
      const second = createUnit()
      await signUp(first.view(), { shiftId: id, accountId: eve.accountId! })
      await signUp(second.view(), { shiftId: id, accountId: fay.accountId! })
      return Promise.allSettled([first.commit(), second.commit()])
    })
    const won = outcomes.filter(o => o.status === 'fulfilled')
    const lost = outcomes.filter((o): o is PromiseRejectedResult => o.status === 'rejected')
    expect(won).toHaveLength(1)
    expect(lost).toHaveLength(1)
    expect(lost[0]!.reason.code).toBe('front-of-house.shift-full')
    const row = await shiftRow(id)
    expect(row.places_taken).toBe(1)
    expect(await rows('SELECT id FROM front_of_house_assignments WHERE shift_id = ?', id)).toHaveLength(1)
  })
})
