// Till sessions that open and close themselves (selling proposal, 17 November 2026): the till opens
// the seller's session at the device's place, else the default space, else unknown; a session is
// moved later; one awaiting its count does not stop the next; a quiet session closes itself when it
// has no cash, stops to be counted when it has, and waits while a payment has no answer.
import { beforeAll, describe, expect, it } from 'vitest'
import { advanceClock, changeSetting, createUnit, newId, nowMs, setClock } from '#kit'
import { addAttempt } from '../../server/answers'
import createVenue from '../../../core/server/api/core/venues/index.post'
import addSpace from '../../../core/server/api/core/venues/[id]/spaces/index.post'
import tillSession from '../../server/api/payments/till/session.post'
import sessionGet from '../../server/api/payments/session.get'
import sessionsPost from '../../server/api/payments/sessions.post'
import sessionPatch from '../../server/api/payments/sessions/[id]/index.patch'
import countPost from '../../server/api/payments/sessions/[id]/count.post'
import spacesGet from '../../server/api/payments/spaces.get'
import salePost from '../../server/api/payments/till/sale.post'
import attestPost from '../../server/api/payments/intents/[id]/attest.post'
import attentionGet from '../../server/api/payments/attention.get'
import closeQuiet from '../../server/tasks/close-quiet-sessions'
import { call, env, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'

const NOV_17 = Date.UTC(2026, 10, 17, 17)
const HOUR = 3_600_000
let cash: string
let keys = 0
let main: string
let studio: string
const handle = server({
  'POST /api/core/venues': createVenue,
  'POST /api/core/venues/:id/spaces': addSpace,
  'POST /api/payments/till/session': tillSession,
  'GET /api/payments/session': sessionGet,
  'POST /api/payments/sessions': sessionsPost,
  'PATCH /api/payments/sessions/:id': sessionPatch,
  'POST /api/payments/sessions/:id/count': countPost,
  'GET /api/payments/spaces': spacesGet,
  'POST /api/payments/till/sale': salePost,
  'POST /api/payments/intents/:id/attest': attestPost,
  'GET /api/payments/attention': attentionGet,
})
const admin = person(['core.venue.manage'])
const seller = () => person(['payments.session.open', 'payments.attempt.attest', 'tickets.orders.sell'])

async function send(method: 'GET' | 'POST' | 'PATCH', path: string, actor: ReturnType<typeof person>, body?: unknown) {
  const response = await call(handle, method, path, { actor, body, headers: method === 'POST' ? { 'idempotency-key': `s${++keys}` } : {} })
  return { status: response.status, body: await response.json() as any }
}
const setting = (key: string, value: unknown) => inContext(async () => {
  const unit = createUnit()
  await changeSetting(unit.view(), key as never, value as never, { reason: 'test', confirm: true })
  await unit.commit()
})
const quietRun = () => inContext(() => closeQuiet(createUnit().view(), { dueAt: nowMs() }) as Promise<void>)
const stateOf = async (id: string) => (await rows<{ state: string, closed_how: string | null }>('SELECT state, closed_how FROM payments_sessions WHERE id = ?', id))[0]

beforeAll(async () => {
  setClock(NOV_17)
  for (const id of ['finance', 'payments', 'tickets']) await setModule(id, true)
  await setting('core.locale.time-zone', 'Europe/London')
  cash = newId('ppa')
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'cash', 'Cash', '[\"desk\"]', 'live', 1, ?, ?)").bind(cash, NOV_17, NOV_17).run()
  const venue = await send('POST', '/api/core/venues', admin, { name: 'Self-opening Theatre' })
  main = venue.body.spaceId
  const kind = (await rows<{ id: string }>("SELECT id FROM core_terms WHERE vocabulary_key = 'core.space-kind' AND slug = 'studio'"))[0]!.id
  studio = (await send('POST', `/api/core/venues/${venue.body.venueId}/spaces`, admin, { name: 'Studio', kindTermId: kind })).body.id
})

describe('opening from the till', () => {
  it('opens at the device\'s place, and returns the open session the next time', async () => {
    const me = seller()
    const opened = await send('POST', '/api/payments/till/session', me, { spaceId: studio })
    expect(opened.body).toMatchObject({ opened: true, session: { state: 'open', spaceId: studio, place: 'Studio, Self-opening Theatre', pointLabel: '', floatMinor: 0 } })
    const again = await send('POST', '/api/payments/till/session', me, { spaceId: main })
    expect(again.body).toMatchObject({ opened: false, session: { id: opened.body.session.id, spaceId: studio } })
  })

  it('falls back to the default space, and to unknown when the place has gone', async () => {
    await setting('payments.sessions.default-space', main)
    try {
      expect((await send('POST', '/api/payments/till/session', seller(), {})).body.session).toMatchObject({ spaceId: main, place: 'Self-opening Theatre' })
      expect((await send('POST', '/api/payments/till/session', seller(), { spaceId: 'spc_gone' })).body.session).toMatchObject({ spaceId: null, place: null })
    }
    finally {
      await setting('payments.sessions.default-space', null)
    }
    expect((await send('POST', '/api/payments/till/session', seller(), {})).body.session).toMatchObject({ spaceId: null })
  })

  it('lists the spaces a session may be at', async () => {
    const { body } = await send('GET', '/api/payments/spaces', seller())
    expect(body.spaces).toEqual(expect.arrayContaining([{ id: main, place: 'Self-opening Theatre' }, { id: studio, place: 'Studio, Self-opening Theatre' }]))
    expect((await send('GET', '/api/payments/spaces', person([]))).status).toBe(403)
  })
})

describe('moving a session', () => {
  it('moves your own open session and changes its note; someone else may not', async () => {
    const me = seller()
    const { body } = await send('POST', '/api/payments/till/session', me, {})
    const id = body.session.id as string
    expect((await send('PATCH', `/api/payments/sessions/${id}`, me, { spaceId: main, pointLabel: 'Foyer bar' })).body.session).toMatchObject({ spaceId: main, pointLabel: 'Foyer bar' })
    expect(await send('PATCH', `/api/payments/sessions/${id}`, me, { spaceId: 'spc_none' })).toMatchObject({ status: 422, body: { code: 'payments.session.no-such-space' } })
    expect((await send('PATCH', `/api/payments/sessions/${id}`, seller(), { spaceId: null })).status).toBe(403)
    const manager = await send('PATCH', `/api/payments/sessions/${id}`, person(['payments.session.close-any'], { reassertedAt: nowMs() }), { spaceId: null })
    expect(manager.body).toMatchObject({ session: { spaceId: null } })
  })

  it('changes the float only before the first cash is taken', async () => {
    await setting('payments.cash.enabled', true)
    try {
      const me = seller()
      const id = (await send('POST', '/api/payments/till/session', me, {})).body.session.id as string
      expect((await send('PATCH', `/api/payments/sessions/${id}`, me, { floatMinor: 2500 })).body.session).toMatchObject({ floatMinor: 2500 })
      const sale = await send('POST', '/api/payments/till/sale', me, { panels: [{ basket: 'tickets', input: { amountMinor: 500 } }] })
      expect((await send('POST', `/api/payments/intents/${sale.body.intentId}/attest`, me, { providerAccountId: cash, method: 'cash' })).body).toMatchObject({ settled: true })
      expect(await send('PATCH', `/api/payments/sessions/${id}`, me, { floatMinor: 3000 })).toMatchObject({ status: 409, body: { code: 'payments.session.float-fixed' } })
    }
    finally {
      await setting('payments.cash.enabled', false)
    }
  })
})

describe('awaiting a count', () => {
  it('does not stop the seller opening the next session, and is listed for them and under Needs attention', async () => {
    await setting('payments.cash.enabled', true)
    try {
      const me = seller()
      const first = (await send('POST', '/api/payments/sessions', me, { floatMinor: 1000 })).body.session.id as string
      await send('POST', `/api/payments/sessions/${first}/count`, me)
      const next = await send('POST', '/api/payments/till/session', me, {})
      expect(next.body).toMatchObject({ opened: true })
      const mine = (await send('GET', '/api/payments/session', me)).body
      expect(mine.session.id).toBe(next.body.session.id)
      expect(mine.awaiting).toEqual([expect.objectContaining({ id: first, state: 'counting', expectedCashMinor: 1000 })])
      const attention = (await send('GET', '/api/payments/attention', person(['payments.attempt.reconcile']))).body
      expect(attention.awaitingCount).toEqual(expect.arrayContaining([expect.objectContaining({ id: first, expectedCashMinor: 1000 })]))
    }
    finally {
      await setting('payments.cash.enabled', false)
    }
  })
})

describe('closing when quiet', () => {
  it('closes a session with no cash once it has been quiet for the setting, not before', async () => {
    const me = seller()
    const { body } = await send('POST', '/api/payments/till/session', me, {})
    const id = body.session.id as string
    expect(body.session.closesAt).toBeUndefined()
    expect((await send('GET', '/api/payments/session', me)).body.session).toMatchObject({ closesAt: nowMs() + 2 * HOUR })
    advanceClock(2 * HOUR - 60_000)
    await quietRun()
    expect(await stateOf(id)).toEqual({ state: 'open', closed_how: null })
    advanceClock(2 * 60_000)
    await quietRun()
    expect(await stateOf(id)).toEqual({ state: 'closed', closed_how: 'quiet' })
    expect(await rows("SELECT id FROM core_events WHERE name = 'payments.session.closed' AND payload LIKE ?", `%${id}%`)).toHaveLength(1)
  })

  it('counts from the last sale, and waits while a payment has no answer', async () => {
    const me = seller()
    const id = (await send('POST', '/api/payments/till/session', me, {})).body.session.id as string
    advanceClock(HOUR)
    const sale = await send('POST', '/api/payments/till/sale', me, { panels: [{ basket: 'tickets', input: { amountMinor: 700 } }] })
    await inContext(async () => {
      const unit = createUnit()
      addAttempt(unit.view(), { intentId: sale.body.intentId, providerAccountId: cash, method: 'cash', amountMinor: 700 })
      await unit.commit()
    })
    advanceClock(HOUR + 60_000)
    await quietRun()
    expect(await stateOf(id)).toEqual({ state: 'open', closed_how: null }) // an hour since the sale
    advanceClock(HOUR)
    await quietRun()
    expect(await stateOf(id)).toEqual({ state: 'open', closed_how: null }) // quiet, but a payment waits
  })

  it('stops a quiet session with cash in it, to be counted', async () => {
    await setting('payments.cash.enabled', true)
    try {
      const me = seller()
      const id = (await send('POST', '/api/payments/sessions', me, { floatMinor: 2000 })).body.session.id as string
      advanceClock(3 * HOUR)
      await quietRun()
      expect(await stateOf(id)).toEqual({ state: 'counting', closed_how: null })
    }
    finally {
      await setting('payments.cash.enabled', false)
    }
  })
})
