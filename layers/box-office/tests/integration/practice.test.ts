// Practice mode at the door and the till (BO-77, PAY-10, PM-20): box-office.door-scan opens tonight's
// door on a house about 60% sold with four reservations unpaid, a pass holder and a booking for
// tomorrow; payments.till and box-office.desk-sale sell from it with a float and the practice card
// reader, whose answer is the trainee's. Each task ticks once done; nothing reaches the real database.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Actor } from '#kit'
import { newId } from '#kit/ids'
import { guardOutsideCalls, setPracticeGate } from '#kit/practice/gate'
import { practiceStore } from '#kit/practice/env'
import { storeDatabase } from '#kit/practice/database'
import { practiceGate } from '../../../core/server/practice/gate'
import start from '../../../core/server/api/core/practice/start.post'
import session from '../../../core/server/api/core/practice/session.get'
import scan from '../../server/api/box-office/performances/[id]/scan.post'
import admit from '../../server/api/box-office/performances/[id]/door/admit.post'
import release from '../../server/api/box-office/performances/[id]/door/release-unpaid.post'
import reserve from '../../server/api/box-office/desk/reserve.post'
import answer from '../../../core/server/api/core/practice/calls/[id].post'
import tillSession from '../../../payments/server/api/payments/till/session.post'
import tillSale from '../../../payments/server/api/payments/till/sale.post'
import tillSummary from '../../../payments/server/api/payments/till/summary.post'
import tillMethods from '../../../payments/server/api/payments/till/methods.get'
import startPayment from '../../../payments/server/api/payments/intents/[id]/start.post'
import attest from '../../../payments/server/api/payments/intents/[id]/attest.post'
import intent from '../../../payments/server/api/payments/intents/[id].get'
import count from '../../../payments/server/api/payments/sessions/[id]/count.post'
import close from '../../../payments/server/api/payments/sessions/[id]/close.post'
import { TOMORROW_CODE } from '../../server/contributions/core.practice-sample/sold-house'
import { call, env, person, rows, server } from '../../../../tests/integration/helpers'
import { ready } from './stage'

const handle = server({
  'POST /api/core/practice/start': start,
  'GET /api/core/practice/session': session,
  'POST /api/box-office/performances/:id/scan': scan,
  'POST /api/box-office/performances/:id/door/admit': admit,
  'POST /api/box-office/performances/:id/door/release-unpaid': release,
  'POST /api/box-office/desk/reserve': reserve,
  'POST /api/core/practice/calls/:id': answer,
  'POST /api/payments/till/session': tillSession,
  'POST /api/payments/till/sale': tillSale,
  'POST /api/payments/till/summary': tillSummary,
  'GET /api/payments/till/methods': tillMethods,
  'POST /api/payments/intents/:id/start': startPayment,
  'POST /api/payments/intents/:id/attest': attest,
  'GET /api/payments/intents/:id': intent,
  'POST /api/payments/sessions/:id/count': count,
  'POST /api/payments/sessions/:id/close': close,
})
const MARK = { 'proscenium-practice': '1', 'referer': 'http://test/practice/live/door' }
const marked = async (actor: Actor, method: string, path: string, body?: unknown) => {
  const response = await call(handle, method, path, { actor, body, headers: { ...MARK, 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as any }
}
const store = (accountId: string) => storeDatabase(practiceStore(env, accountId))
const many = async <T>(accountId: string, sql: string, ...params: unknown[]) => (await store(accountId).prepare(sql).bind(...params).all<T>()).results
const passed = async (me: Actor) => (await marked(me, 'GET', '/api/core/practice/session')).body.tasks.filter((t: any) => t.passedAt).map((t: any) => t.id).sort()

beforeAll(async () => {
  setPracticeGate(practiceGate)
  guardOutsideCalls()
  await ready()
})
afterAll(() => setPracticeGate(undefined))

describe('practising the door (box-office.door-scan)', () => {
  it('opens tonight\'s door on a house about 60% sold, with four unpaid reservations, a pass and a booking for tomorrow', async () => {
    const me = person(['core.practice.manage'])
    const before = await rows('SELECT count(*) AS n FROM box_office_orders')
    const started = await call(handle, 'POST', '/api/core/practice/start', { actor: me, body: { scenario: 'box-office.door-scan' }, headers: MARK })
    const body = await started.json() as any
    expect(started.status, JSON.stringify(body)).toBe(200)
    const tonight = body.to.split('/').pop()
    expect(body.to).toBe(`/practice/live/door/${tonight}`)

    const id = me.accountId!
    const lines = await many<{ state: string, n: number }>(id, `SELECT o.state, count(*) AS n FROM box_office_order_lines l JOIN box_office_orders o ON o.id = l.order_id
      WHERE l.performance_id = ? AND l.kind = 'ticket' AND l.state = 'live' GROUP BY o.state ORDER BY o.state`, tonight)
    expect(lines).toEqual([{ state: 'confirmed', n: 16 }, { state: 'reserved', n: 8 }])
    expect(await many(id, "SELECT count(*) AS n FROM box_office_orders WHERE state = 'reserved'")).toEqual([{ n: 4 }])
    expect(await many(id, 'SELECT count(*) AS n FROM box_office_pass_redemptions')).toEqual([{ n: 1 }])
    expect(await many(id, "SELECT count(*) AS n FROM box_office_orders WHERE desk_code_hash IS NOT NULL AND state = 'confirmed'")).toEqual([{ n: 1 }])
    expect(await rows('SELECT count(*) AS n FROM box_office_orders')).toEqual(before)
  })

  it('ticks each task once it is done', async () => {
    const me = person(['core.practice.manage'])
    const { to } = await call(handle, 'POST', '/api/core/practice/start', { actor: me, body: { scenario: 'box-office.door-scan' }, headers: MARK }).then(r => r.json()) as any
    const tonight = to.split('/').pop()
    expect(await passed(me)).toEqual([])

    const turned = await marked(me, 'POST', `/api/box-office/performances/${tonight}/scan`, { code: TOMORROW_CODE })
    expect(turned.body.result).toBe('wrong_performance')
    expect(await passed(me)).toEqual(['refuse-tomorrow'])

    const paid = await many<{ id: string }>(me.accountId!, `SELECT DISTINCT o.id FROM box_office_orders o JOIN box_office_order_lines l ON l.order_id = o.id
      WHERE o.state = 'confirmed' AND l.performance_id = ? ORDER BY o.reference LIMIT 3`, tonight)
    for (const order of paid) expect((await marked(me, 'POST', `/api/box-office/performances/${tonight}/door/admit`, { orderId: order.id, count: 2 })).status).toBe(200)
    expect(await passed(me)).toEqual(['admit-five', 'by-name', 'refuse-tomorrow'])

    expect((await marked(me, 'POST', `/api/box-office/performances/${tonight}/door/release-unpaid`, {})).body.released).toHaveLength(4)
    expect(await passed(me)).toEqual(['admit-five', 'by-name', 'refuse-tomorrow', 'release-unpaid'])
  })
})

/** Starts a scenario and opens the till: tonight's performance, its band and full-price type, and the till's ways to pay. */
async function atTheTill(me: Actor, scenario: string) {
  const { to } = await call(handle, 'POST', '/api/core/practice/start', { actor: me, body: { scenario }, headers: MARK }).then(r => r.json()) as any
  expect(to).toBe('/practice/live/till')
  const id = me.accountId!
  const [tonight] = await many<{ id: string }>(id, 'SELECT id FROM core_performances ORDER BY starts_at LIMIT 1')
  const [band] = await many<{ id: string }>(id, 'SELECT id FROM box_office_bands LIMIT 1')
  const [type] = await many<{ ticket_type_id: string }>(id, 'SELECT ticket_type_id FROM box_office_prices WHERE amount_minor > 0 LIMIT 1')
  const session = await marked(me, 'POST', '/api/payments/till/session', {})
  expect(session.status, JSON.stringify(session.body)).toBe(200)
  const methods = (await marked(me, 'GET', '/api/payments/till/methods')).body
  const tickets = (quantity: number) => ({ performanceId: tonight!.id, lines: [{ bandId: band!.id, ticketTypeId: type!.ticket_type_id, quantity }] })
  const sell = async (quantity: number) => (await marked(me, 'POST', '/api/payments/till/sale', { panels: [{ basket: 'box-office', input: tickets(quantity) }] })).body.intentId as string
  return { session: session.body.session, methods, tickets, sell }
}

/** The till's offer for a way of paying. */
const offer = (methods: any, method: string) => (methods.methods ?? methods).find((m: any) => m.method === method)

/** Starts a card payment on the practice reader and answers it as the trainee would. */
async function card(me: Actor, intentId: string, reader: string, outcome: 'approved' | 'declined') {
  const started = await marked(me, 'POST', `/api/payments/intents/${intentId}/start`, { providerAccountId: reader, method: 'card_reader' })
  expect(started.status, JSON.stringify(started.body)).toBe(200)
  const waiting = (await marked(me, 'GET', '/api/core/practice/session')).body.waiting
  expect(waiting).toHaveLength(1)
  return marked(me, 'POST', `/api/core/practice/calls/${waiting[0].attemptId}`, { outcome })
}

describe('practising the till (payments.till)', () => {
  it('opens with a float, takes a card the trainee declines and then approves, cash with change, and cashes up', async () => {
    const me = person(['core.practice.manage'])
    const till = await atTheTill(me, 'payments.till')
    expect(till.session).toMatchObject({ state: 'open', floatMinor: 5000 })
    const reader = offer(till.methods, 'card_reader')
    expect(reader).toMatchObject({ provider: 'practice-reader' })
    // The real site's cash account came across, so the cash task is set.
    const cash = offer(till.methods, 'cash')
    expect(cash).toBeTruthy()
    expect((await marked(me, 'GET', '/api/core/practice/session')).body.tasks.map((t: any) => t.id)).toEqual(['declined-then-good', 'cash-change', 'close-right'])

    const sale = await till.sell(2)
    expect((await card(me, sale, reader.providerAccountId, 'declined')).body.state).toBe('failed')
    expect((await card(me, sale, reader.providerAccountId, 'approved')).body.state).toBe('succeeded')
    expect((await marked(me, 'GET', `/api/payments/intents/${sale}`)).body.state).toBe('succeeded')
    expect(await passed(me)).toEqual(['declined-then-good'])

    const second = await till.sell(1)
    const due = (await marked(me, 'GET', `/api/payments/intents/${second}`)).body.amountMinor as number
    expect((await marked(me, 'POST', `/api/payments/intents/${second}/attest`, { providerAccountId: cash.providerAccountId, method: 'cash', tenderedMinor: due + 500 })).status).toBe(200)
    expect(await passed(me)).toEqual(['cash-change', 'declined-then-good'])

    const counting = await marked(me, 'POST', `/api/payments/sessions/${till.session.id}/count`, {})
    const closed = await marked(me, 'POST', `/api/payments/sessions/${till.session.id}/close`, { countedMinor: counting.body.session.expectedCashMinor })
    expect(closed.body.varianceMinor).toBe(0)
    expect(await passed(me)).toEqual(['cash-change', 'close-right', 'declined-then-good'])
    expect(await rows("SELECT count(*) AS n FROM payments_provider_accounts WHERE provider = 'practice-reader'")).toEqual([{ n: 0 }])
  })
})

describe('practising a sale at the desk (box-office.desk-sale)', () => {
  it('ticks two tickets paid for by card, and one reserved to pay later', async () => {
    const me = person(['core.practice.manage'])
    const till = await atTheTill(me, 'box-office.desk-sale')
    const sale = await till.sell(2)
    await card(me, sale, offer(till.methods, 'card_reader').providerAccountId, 'approved')
    expect(await passed(me)).toEqual(['card-two'])
    const each = (await marked(me, 'POST', '/api/payments/till/summary', { panels: [{ basket: 'box-office', input: till.tickets(1) }] })).body.amountMinor as number
    const reserved = await marked(me, 'POST', '/api/box-office/desk/reserve', { sale: till.tickets(1), expectedTotalMinor: each, email: 'ash.example@practice.invalid' })
    expect(reserved.status, JSON.stringify(reserved.body)).toBe(200)
    expect(await passed(me)).toEqual(['card-two', 'reserve'])
  })
})
