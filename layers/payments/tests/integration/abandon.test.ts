// Giving up on a payment still waiting for its answer (Box office specification, part 4): the seller
// cancels and takes the money another way; the provider is asked to stop as a best effort; money the
// provider takes after all is held in payments.unfulfilled and refunded in full, and the intent stays
// cancelled. Money taken towards a sale that then expires goes back the same way.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, nowMs, setClock } from '#kit'
import { attest, cancelIntent, createIntent, openSession, recordAnswer } from '../../server/services'
import { addAttempt } from '../../server/answers'
import { expireIntent } from '../../server/tasks/expire-intents'
import cancelRoute from '../../server/api/payments/intents/[id]/cancel.post'
import giveBackRoute from '../../server/api/payments/intents/[id]/give-back.post'
import { world } from '../../../../tests/fixtures/modules/cardco/server/contributions/payments.provider/cardco'
import { call, deliver, env, inContext, person, rows, sent, server, setModule } from '../../../../tests/integration/helpers'

const NOV_16 = Date.UTC(2026, 10, 16, 19)
const MINUTE = 60_000
let card: string
let cash: string

const handle = server({ 'POST /api/payments/intents/:id/cancel': cancelRoute, 'POST /api/payments/intents/:id/give-back': giveBackRoute })

async function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T>): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}

async function waiting(amount: number) {
  const orderId = newId('tko')
  return commit(async (unit) => {
    const view = unit.view()
    view.add({ sql: "INSERT INTO tickets_orders (id, amount_minor, state) VALUES (?, ?, 'held')", params: [orderId, amount] })
    const { intentId } = await createIntent(view, { parts: [{ owner: { module: 'tickets', record: orderId }, amountMinor: amount }], channel: 'online', expiresAt: nowMs() + 15 * MINUTE })
    const attempt = addAttempt(view, { intentId, providerAccountId: card, method: 'card_online', amountMinor: amount })
    return { orderId, intentId, attemptId: attempt.id }
  })
}

const state = async (table: string, id: string) => (await rows<{ state: string }>(`SELECT state FROM ${table} WHERE id = ?`, id))[0]!.state
const balance = async (key: string) => (await rows<{ total: number }>('SELECT coalesce(sum(e.amount_minor), 0) AS total FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE a.system_key = ?', key))[0]!.total

beforeAll(async () => {
  setClock(NOV_16)
  for (const id of ['finance', 'payments', 'tickets', 'cardco']) await setModule(id, true)
  await commit(unit => changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true }))
  // These take cash at the desk, which a theatre turns on.
  await commit(unit => changeSetting(unit.view(), 'payments.cash.enabled', true, { reason: 'test', confirm: true }))
  card = newId('ppa')
  cash = newId('ppa')
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'cardco', 'CardCo', '[\"online\",\"desk\"]', 'live', 1, ?, ?)").bind(card, NOV_16, NOV_16).run()
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'cash', 'Cash', '[\"desk\"]', 'live', 1, ?, ?)").bind(cash, NOV_16, NOV_16).run()
})

beforeEach(() => {
  setClock(NOV_16)
  sent.length = 0
  world.refundKeys.length = 0
  world.refundAnswer = { state: 'succeeded' }
})

describe('giving up on a payment still waiting', () => {
  it('cancels the intent, releases the sale, and names the payment still waiting', async () => {
    const { intentId, orderId, attemptId } = await waiting(1200)
    const res = await call(handle, 'POST', `/api/payments/intents/${intentId}/cancel`, { actor: person(['payments.attempt.attest']), body: {} })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ cancelled: true, waiting: [attemptId] })
    expect(await state('payments_intents', intentId)).toBe('cancelled')
    expect(await state('tickets_orders', orderId)).toBe('released')
  })

  it('holds money the provider takes after all, refunds it in full, and leaves the intent cancelled', async () => {
    const { intentId, attemptId, orderId } = await waiting(1500)
    await commit(unit => cancelIntent(unit.view(), intentId))
    const held = await balance('payments.unfulfilled')
    const out = await inContext(() => recordAnswer(attemptId, { state: 'succeeded', providerRef: `cc_${attemptId}` }, { kind: 'poll' }))
    expect(out).toMatchObject({ changed: true, settled: false })
    expect(await state('payments_attempts', attemptId)).toBe('succeeded')
    expect(await state('payments_intents', intentId)).toBe('cancelled')
    expect(await state('tickets_orders', orderId)).toBe('released')
    expect(await balance('payments.unfulfilled') - held).toBe(-1500)
    const [refund] = await rows<{ id: string, amount_minor: number, state: string }>('SELECT id, amount_minor, state FROM payments_refunds WHERE attempt_id = ?', attemptId)
    expect(refund).toMatchObject({ amount_minor: 1500, state: 'approved' })
    await deliver()
    expect(await state('payments_refunds', refund!.id)).toBe('succeeded')
    expect(await balance('payments.unfulfilled') - held).toBe(0)
  })

  it('changes nothing more when the payment the seller gave up on fails', async () => {
    const { intentId, attemptId } = await waiting(700)
    await commit(unit => cancelIntent(unit.view(), intentId))
    await inContext(() => recordAnswer(attemptId, { state: 'failed', failureCode: 'declined' }, { kind: 'poll' }))
    expect(await rows('SELECT id FROM payments_refunds WHERE attempt_id = ?', attemptId)).toEqual([])
    expect(await rows('SELECT id FROM finance_postings WHERE source_id = ?', attemptId)).toEqual([])
  })
})

describe('a sale left after part was paid', () => {
  it('expires and sends back what was taken', async () => {
    const orderId = newId('tko')
    const { intentId } = await commit(async (unit) => {
      const view = unit.view()
      view.add({ sql: "INSERT INTO tickets_orders (id, amount_minor, state) VALUES (?, ?, 'held')", params: [orderId, 2000] })
      return createIntent(view, { parts: [{ owner: { module: 'tickets', record: orderId }, amountMinor: 2000 }], channel: 'desk', expiresAt: nowMs() + 15 * MINUTE })
    })
    const { attemptId } = await inContext(() => attest({ intentId, providerAccountId: cash, method: 'cash', amountMinor: 800 }), person(['payments.attempt.attest']))
    await expect(commit(unit => cancelIntent(unit.view(), intentId))).rejects.toMatchObject({ code: 'payments.intent.paid-in-part' })
    setClock(NOV_16 + 16 * MINUTE)
    await inContext(() => expireIntent(intentId))
    expect(await state('payments_intents', intentId)).toBe('expired')
    const [refund] = await rows<{ amount_minor: number, state: string }>('SELECT amount_minor, state FROM payments_refunds WHERE attempt_id = ?', attemptId)
    expect(refund).toEqual({ amount_minor: 800, state: 'approved' })
  })
})

describe('giving back what was taken for a sale paid in part (BO-35)', () => {
  const seller = person(['payments.attempt.attest', 'payments.session.open'])
  let sessionId: string

  beforeAll(async () => {
    sessionId = await commit(unit => openSession(unit.view(), { accountId: seller.accountId!, pointLabel: 'Foyer', floatMinor: 0 }))
  })

  async function partPaid(amount: number, cashMinor: number, cardMinor = 0) {
    const orderId = newId('tko')
    const { intentId } = await commit(async (unit) => {
      const view = unit.view()
      view.add({ sql: "INSERT INTO tickets_orders (id, amount_minor, state) VALUES (?, ?, 'held')", params: [orderId, amount] })
      return createIntent(view, { parts: [{ owner: { module: 'tickets', record: orderId }, amountMinor: amount }], channel: 'desk', sessionId, expiresAt: nowMs() + 15 * MINUTE })
    })
    if (cashMinor) await inContext(() => attest({ intentId, providerAccountId: cash, method: 'cash', amountMinor: cashMinor }), seller)
    let cardAttempt: string | undefined
    if (cardMinor) {
      cardAttempt = await commit(async unit => addAttempt(unit.view(), { intentId, providerAccountId: card, method: 'card_online', amountMinor: cardMinor }).id)
      await inContext(() => recordAnswer(cardAttempt!, { state: 'succeeded', providerRef: `cc_${cardAttempt}` }, { kind: 'poll' }))
    }
    return { orderId, intentId, cardAttempt }
  }
  const giveBack = (intentId: string, actor = seller) => call(handle, 'POST', `/api/payments/intents/${intentId}/give-back`, { actor, body: {} })

  it('ends the sale, releases it, hands the cash back from the seller\'s session and sends the card back', async () => {
    const held = await balance('payments.unfulfilled')
    const { orderId, intentId, cardAttempt } = await partPaid(3000, 1000, 1200)
    const res = await giveBack(intentId)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ givenBack: true, handedBack: [{ method: 'cash', amountMinor: 1000 }], sent: [{ method: 'card_online', amountMinor: 1200 }], unconfirmed: 0 })
    expect(await state('payments_intents', intentId)).toBe('unfulfilled')
    expect(await state('tickets_orders', orderId)).toBe('released')
    const cashRefund = (await rows<{ state: string, session_id: string | null }>("SELECT r.state, r.session_id FROM payments_refunds r JOIN payments_attempts a ON a.id = r.attempt_id WHERE a.intent_id = ? AND a.method = 'cash'", intentId))[0]
    expect(cashRefund).toEqual({ state: 'succeeded', session_id: sessionId })
    // The card's money waits in payments.unfulfilled until the provider sends it back.
    expect(await balance('payments.unfulfilled') - held).toBe(-1200)
    await deliver()
    expect((await rows<{ state: string }>('SELECT state FROM payments_refunds WHERE attempt_id = ?', cardAttempt!))[0]!.state).toBe('succeeded')
    expect(await balance('payments.unfulfilled') - held).toBe(0)
    // Nothing was sold, so no income moved.
    expect(await rows("SELECT p.id FROM finance_postings p WHERE p.kind = 'sale' AND p.source_id = ?", intentId)).toEqual([])
  })

  it('refuses when nothing was taken, and once the sale has ended', async () => {
    const { intentId } = await partPaid(1000, 0)
    expect(await (await giveBack(intentId)).json()).toMatchObject({ code: 'payments.giveback.nothing-taken' })
    const paid = await partPaid(1000, 400)
    expect((await giveBack(paid.intentId)).status).toBe(200)
    expect(await (await giveBack(paid.intentId)).json()).toMatchObject({ code: 'payments.intent.not-open' })
  })

  it('lets someone else give back only with refund approval, within the self-approve limit', async () => {
    const { intentId } = await partPaid(2000, 600)
    const other = await giveBack(intentId, person(['payments.attempt.attest']))
    expect(other.status).toBe(403)
    expect(await other.json()).toMatchObject({ code: 'payments.giveback.not-yours' })
    const approver = person(['payments.attempt.attest', 'payments.refund.approve'])
    expect(await (await giveBack(intentId, approver)).json()).toMatchObject({ code: 'payments.giveback.over-limit' })
    await commit(unit => changeSetting(unit.view(), 'payments.refunds.self-approve-up-to', 1000, { reason: 'test', confirm: true }))
    const res = await giveBack(intentId, approver)
    expect(res.status).toBe(200)
    // The approver has no till session of their own, so the cash waits on Refunds to be confirmed.
    expect(await res.json()).toMatchObject({ handedBack: [], unconfirmed: 1 })
    expect(await state('payments_intents', intentId)).toBe('unfulfilled')
  })
})
