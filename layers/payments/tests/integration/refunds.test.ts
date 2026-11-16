// Refunds per part (Box office specification, part 3, "A refund"; BO-51 and PAY-07): a refund names
// one part and one payment, never exceeds either, goes back the way it came, needs a second person
// above the limit stored when it was asked for (judged on resolved accounts), and posts the owner's
// own entries back. An unfulfilled payment is refunded in full by the system.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, nowMs, setClock } from '#kit'
import { listTerms } from '#modules/core'
import { collect, createIntent, attest, recordAnswer, requestRefund, approveRefund, declineRefund, openSession } from '../../server/services'
import { addAttempt } from '../../server/answers'
import { expectedCash, getSession } from '../../server/sessions'
import confirmRoute from '../../server/api/payments/refunds/[id]/confirm.post'
import approveRoute from '../../server/api/payments/refunds/[id]/approve.post'
import listRoute from '../../server/api/payments/refunds.get'
import reasonsRoute from '../../server/api/payments/refunds/decline-reasons.get'
import attentionRoute from '../../server/api/payments/attention.get'
import attentionCount from '../../server/contributions/core.count/attention'
import waitingCount from '../../server/contributions/core.count/refunds-waiting'
import { world } from '../../../../tests/fixtures/modules/cardco/server/contributions/payments.provider/cardco'
import { call, deliver, env, inContext, person, rows, sent, server, setModule } from '../../../../tests/integration/helpers'

const NOV_16 = Date.UTC(2026, 10, 16, 12)
let cash: string
let card: string

const handle = server({
  'POST /api/payments/refunds/:id/confirm': confirmRoute,
  'POST /api/payments/refunds/:id/approve': approveRoute,
  'GET /api/payments/refunds': listRoute,
  'GET /api/payments/refunds/decline-reasons': reasonsRoute,
  'GET /api/payments/attention': attentionRoute,
})

async function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T>): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}

async function setLimit(value: number) {
  await commit(unit => changeSetting(unit.view(), 'payments.refunds.self-approve-up-to', value, { reason: 'test', confirm: true }))
}

interface Paid { intentId: string, ticketsPart: string, snacksPart?: string, attemptId: string }

/** Tickets (and snacks) paid at the desk in cash. */
async function paidInCash(tickets: number, snacks?: number, sessionId?: string): Promise<Paid> {
  const { intentId } = await commit(async (unit) => {
    const view = unit.view()
    const order = newId('tko')
    view.add({ sql: "INSERT INTO tickets_orders (id, amount_minor, state) VALUES (?, ?, 'held')", params: [order, tickets] })
    const parts = [{ owner: { module: 'tickets', record: order }, amountMinor: tickets }]
    if (snacks) {
      const sale = newId('sns')
      view.add({ sql: "INSERT INTO snacks_sales (id, amount_minor, state) VALUES (?, ?, 'held')", params: [sale, snacks] })
      parts.push({ owner: { module: 'snacks', record: sale }, amountMinor: snacks })
    }
    return createIntent(view, { parts, channel: 'desk', sessionId, expiresAt: nowMs() + 600_000 })
  })
  const { attemptId } = await inContext(() => attest({ intentId, providerAccountId: cash, method: 'cash' }))
  const parts = await rows<{ id: string, owner_module: string }>('SELECT id, owner_module FROM payments_intent_parts WHERE intent_id = ?', intentId)
  return { intentId, attemptId, ticketsPart: parts.find(p => p.owner_module === 'tickets')!.id, snacksPart: parts.find(p => p.owner_module === 'snacks')?.id }
}

/** Tickets paid online through cardco. */
async function paidByCard(amount: number, release?: boolean): Promise<Paid> {
  const order = newId('tko')
  const { intentId, attemptId } = await commit(async (unit) => {
    const view = unit.view()
    view.add({ sql: "INSERT INTO tickets_orders (id, amount_minor, state) VALUES (?, ?, 'held')", params: [order, amount] })
    const { intentId } = await collect(view, { parts: [{ owner: { module: 'tickets', record: order }, amountMinor: amount }], expiresAt: nowMs() + 600_000 })
    return { intentId, attemptId: addAttempt(view, { intentId, providerAccountId: card, method: 'card_online', amountMinor: amount }).id }
  })
  if (release) await env.DB.prepare("UPDATE tickets_orders SET state = 'released' WHERE id = ?").bind(order).run()
  await inContext(() => recordAnswer(attemptId, { state: 'succeeded', providerRef: `cc_${attemptId}` }, { kind: 'poll' }))
  const [part] = await rows<{ id: string }>('SELECT id FROM payments_intent_parts WHERE intent_id = ?', intentId)
  return { intentId, attemptId, ticketsPart: part!.id }
}

const counters = async (partId: string, attemptId: string) => ({
  part: (await rows<{ refunded_minor: number }>('SELECT refunded_minor FROM payments_intent_parts WHERE id = ?', partId))[0]!.refunded_minor,
  attempt: (await rows<{ refunded_minor: number }>('SELECT refunded_minor FROM payments_attempts WHERE id = ?', attemptId))[0]!.refunded_minor,
})
const refundState = async (id: string) => (await rows<{ state: string }>('SELECT state FROM payments_refunds WHERE id = ?', id))[0]?.state
const entriesOf = (key: string) => rows<{ system_key: string, amount_minor: number }>(
  'SELECT a.system_key, e.amount_minor FROM finance_entries e JOIN finance_postings p ON p.id = e.posting_id JOIN finance_accounts a ON a.id = e.account_id WHERE p.idempotency_key = ? ORDER BY e.amount_minor', key)

beforeAll(async () => {
  setClock(NOV_16)
  for (const id of ['finance', 'payments', 'tickets', 'snacks', 'cardco']) await setModule(id, true)
  await commit(unit => changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true }))
  cash = newId('ppa')
  card = newId('ppa')
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'cash', 'Cash', '[\"desk\"]', 'live', 1, ?, ?), (?, 'cardco', 'CardCo', '[\"online\"]', 'live', 1, ?, ?)")
    .bind(cash, NOV_16, NOV_16, card, NOV_16, NOV_16).run()
})

describe('refund-stays-inside-its-part', () => {
  it('refuses more than the part, even when the payment as a whole has room', async () => {
    const paid = await paidInCash(1000, 500)
    await expect(commit(unit => requestRefund(unit.view(), { partId: paid.snacksPart!, amountMinor: 600, requestedBy: 'acc_a' }))).rejects.toMatchObject({ code: 'payments.refund.too-much' })
  })
})

describe('own-refund-not-approved', () => {
  it('needs a second person above the limit, and lets one person do it at or under it', async () => {
    await setLimit(0)
    const paid = await paidInCash(1000)
    const asked = await commit(unit => requestRefund(unit.view(), { partId: paid.ticketsPart, amountMinor: 300, requestedBy: 'acc_alice' }))
    expect(asked.state).toBe('requested')
    await expect(commit(unit => approveRefund(unit.view(), asked.refundId, 'acc_alice'))).rejects.toMatchObject({ code: 'payments.refund.own' })
    // The CHECK is the backstop.
    await expect(env.DB.prepare("UPDATE payments_refunds SET state = 'approved', approved_by = requested_by WHERE id = ?").bind(asked.refundId).run()).rejects.toThrow(/two_people|CHECK/)
    await setLimit(500)
    const small = await commit(unit => requestRefund(unit.view(), { partId: paid.ticketsPart, amountMinor: 200, requestedBy: 'acc_alice' }))
    expect(small.state).toBe('approved')
    expect(await rows('SELECT approved_by FROM payments_refunds WHERE id = ?', small.refundId)).toEqual([{ approved_by: 'acc_alice' }])
    await setLimit(0)
  })

  it('self-approve-limit-is-fixed-at-request: raising it afterwards does not let the requester approve', async () => {
    await setLimit(0)
    const paid = await paidInCash(800)
    const asked = await commit(unit => requestRefund(unit.view(), { partId: paid.ticketsPart, amountMinor: 400, requestedBy: 'acc_bob' }))
    await setLimit(1000)
    await expect(commit(unit => approveRefund(unit.view(), asked.refundId, 'acc_bob'))).rejects.toMatchObject({ code: 'payments.refund.own' })
    await setLimit(0)
  })

  it('compares resolved accounts: once A is merged into B, B cannot approve what A asked for', async () => {
    await setLimit(0)
    const a = newId('acc')
    const b = newId('acc')
    await env.DB.prepare("INSERT INTO core_accounts (id, origin, created_at) VALUES (?, 'test', ?), (?, 'test', ?)").bind(a, NOV_16, b, NOV_16).run()
    const paid = await paidInCash(900)
    const asked = await commit(unit => requestRefund(unit.view(), { partId: paid.ticketsPart, amountMinor: 900, requestedBy: a }))
    await env.DB.prepare('UPDATE core_accounts SET merged_into_id = ?, merged_at = ? WHERE id = ?').bind(b, NOV_16, a).run()
    await expect(commit(unit => approveRefund(unit.view(), asked.refundId, b))).rejects.toMatchObject({ code: 'payments.refund.own' })
    await commit(unit => approveRefund(unit.view(), asked.refundId, newId('acc')))
    expect(await refundState(asked.refundId)).toBe('approved')
  })

  it('refuses the approve route on your own refund', async () => {
    const paid = await paidInCash(700)
    const alice = person(['payments.refund.approve'])
    const asked = await commit(unit => requestRefund(unit.view(), { partId: paid.ticketsPart, amountMinor: 700, requestedBy: alice.accountId! }))
    expect((await call(handle, 'POST', `/api/payments/refunds/${asked.refundId}/approve`, { actor: alice, body: {} })).status).toBe(403)
    const listed = await (await call(handle, 'GET', '/api/payments/refunds?state=requested', { actor: alice })).json() as { refunds: { id: string }[] }
    expect(listed.refunds.map(r => r.id)).toContain(asked.refundId)
  })
})

describe('double-refund-refused and declined-refund-moves-no-counter', () => {
  it('approves one of two full refunds of one payment; the counters refuse the other', async () => {
    const paid = await paidInCash(1500)
    const first = await commit(unit => requestRefund(unit.view(), { partId: paid.ticketsPart, amountMinor: 1500, requestedBy: 'acc_c' }))
    const second = await commit(unit => requestRefund(unit.view(), { partId: paid.ticketsPart, amountMinor: 1500, requestedBy: 'acc_d' }))
    await commit(unit => approveRefund(unit.view(), first.refundId, 'acc_e'))
    await expect(commit(unit => approveRefund(unit.view(), second.refundId, 'acc_e'))).rejects.toThrow(/refunded|CHECK/)
    expect(await counters(paid.ticketsPart, paid.attemptId)).toEqual({ part: 1500, attempt: 1500 })
  })

  it('declines with a reason from the list and moves no counter', async () => {
    const paid = await paidInCash(600)
    const asked = await commit(unit => requestRefund(unit.view(), { partId: paid.ticketsPart, amountMinor: 600, requestedBy: 'acc_f' }))
    const [reason] = await inContext(() => listTerms('payments.refund-decline-reason'))
    await expect(commit(async unit => declineRefund(unit.view(), asked.refundId, 'acc_g', newId('trm')))).rejects.toMatchObject({ code: 'payments.refund.cannot-decline' })
    await commit(async unit => declineRefund(unit.view(), asked.refundId, 'acc_g', reason!.id))
    expect(await refundState(asked.refundId)).toBe('declined')
    expect(await counters(paid.ticketsPart, paid.attemptId)).toEqual({ part: 0, attempt: 0 })
  })
})

describe('refunds through a provider', () => {
  it('sends an approved card refund with its key, posts the owner\'s entries back, and frees nothing twice', async () => {
    world.refundAnswer = { state: 'succeeded', providerRef: 're_1' }
    const paid = await paidByCard(2000)
    sent.length = 0
    const asked = await commit(unit => requestRefund(unit.view(), { partId: paid.ticketsPart, amountMinor: 500, requestedBy: 'acc_h' }))
    await commit(unit => approveRefund(unit.view(), asked.refundId, 'acc_i'))
    expect(await deliver()).toEqual(['done'])
    expect(world.refundKeys).toContain(`payments:refund:${asked.refundId}`)
    expect(await refundState(asked.refundId)).toBe('succeeded')
    expect(await entriesOf(`payments:refund:${asked.refundId}`)).toEqual([{ system_key: 'payments.card-clearing', amount_minor: -500 }, { system_key: 'tickets.income', amount_minor: 500 }])
    expect(await rows("SELECT name FROM core_events WHERE name = 'payments.refund.succeeded' AND payload LIKE ?", `%${asked.refundId}%`)).toHaveLength(1)
  })

  it('refunds-never-exceed-payment: a failed refund gives its amount back', async () => {
    const paid = await paidByCard(1000)
    world.refundAnswer = { state: 'failed', failureCode: 'insufficient_balance' }
    sent.length = 0
    const asked = await commit(unit => requestRefund(unit.view(), { partId: paid.ticketsPart, amountMinor: 1000, requestedBy: 'acc_j' }))
    await commit(unit => approveRefund(unit.view(), asked.refundId, 'acc_k'))
    expect(await counters(paid.ticketsPart, paid.attemptId)).toEqual({ part: 1000, attempt: 1000 })
    await deliver()
    expect(await refundState(asked.refundId)).toBe('failed')
    expect(await counters(paid.ticketsPart, paid.attemptId)).toEqual({ part: 0, attempt: 0 })
    // Needs attention lists the refund the provider turned down, and counts it beside its entry.
    const reconciler = person(['payments.attempt.reconcile'])
    const attention = await (await call(handle, 'GET', '/api/payments/attention', { actor: reconciler })).json() as any
    expect(attention.failedRefunds).toContainEqual(expect.objectContaining({ id: asked.refundId, amountMinor: 1000, method: 'card_online' }))
    expect(await inContext(() => attentionCount.value(reconciler))).toBeGreaterThanOrEqual(1)
    expect(await inContext(() => attentionCount.value(person([])))).toBe(0)
    world.refundAnswer = { state: 'succeeded' }
    const again = await commit(unit => requestRefund(unit.view(), { partId: paid.ticketsPart, amountMinor: 1000, requestedBy: 'acc_j' }))
    await commit(unit => approveRefund(unit.view(), again.refundId, 'acc_k'))
    await deliver()
    expect(await refundState(again.refundId)).toBe('succeeded')
    await expect(commit(unit => requestRefund(unit.view(), { partId: paid.ticketsPart, amountMinor: 1, requestedBy: 'acc_j' }))).rejects.toMatchObject({ code: 'payments.refund.too-much' })
  })

  it('refund-goes-back-the-way-it-came: a card payment is not handed back as cash', async () => {
    world.refundAnswer = { state: 'pending' }
    const paid = await paidByCard(400)
    const asked = await commit(unit => requestRefund(unit.view(), { partId: paid.ticketsPart, amountMinor: 400, requestedBy: 'acc_l' }))
    await commit(unit => approveRefund(unit.view(), asked.refundId, 'acc_m'))
    const seller = person(['payments.attempt.attest'])
    const refused = await call(handle, 'POST', `/api/payments/refunds/${asked.refundId}/confirm`, { actor: seller, body: {} })
    expect(refused.status).toBe(409)
    expect(await refused.json()).toMatchObject({ code: 'payments.refund.goes-back-by-provider' })
    sent.length = 0
  })
})

describe('cash handed back', () => {
  it('comes out of the seller\'s till session and is posted against cash', async () => {
    const seller = person(['payments.attempt.attest'])
    const sessionId = await commit(unit => openSession(unit.view(), { accountId: seller.accountId!, pointLabel: 'Desk', floatMinor: 1000 }))
    const paid = await paidInCash(1200, undefined, sessionId)
    const asked = await commit(unit => requestRefund(unit.view(), { partId: paid.ticketsPart, amountMinor: 1200, requestedBy: 'acc_n' }))
    await commit(unit => approveRefund(unit.view(), asked.refundId, 'acc_o'))
    expect((await call(handle, 'POST', `/api/payments/refunds/${asked.refundId}/confirm`, { actor: seller, body: {} })).status).toBe(200)
    expect(await entriesOf(`payments:refund:${asked.refundId}`)).toEqual([{ system_key: 'payments.cash', amount_minor: -1200 }, { system_key: 'tickets.income', amount_minor: 1200 }])
    expect(await inContext(async () => expectedCash((await getSession(sessionId))!))).toBe(1000)
  })
})

describe('payment-after-hold-released', () => {
  it('refunds an unfulfilled card payment in full, by the system, from payments.unfulfilled', async () => {
    world.refundAnswer = { state: 'succeeded' }
    sent.length = 0
    const paid = await paidByCard(1800, true)
    expect(await rows('SELECT state FROM payments_intents WHERE id = ?', paid.intentId)).toEqual([{ state: 'unfulfilled' }])
    const [refund] = await rows<{ id: string, state: string, requested_by: string | null, amount_minor: number }>('SELECT id, state, requested_by, amount_minor FROM payments_refunds WHERE part_id = ?', paid.ticketsPart)
    expect(refund).toMatchObject({ state: 'approved', requested_by: null, amount_minor: 1800 })
    await deliver()
    expect(await refundState(refund!.id)).toBe('succeeded')
    expect(await entriesOf(`payments:refund:${refund!.id}`)).toEqual([{ system_key: 'payments.card-clearing', amount_minor: -1800 }, { system_key: 'payments.unfulfilled', amount_minor: 1800 }])
  })

  it('splits the refund of an unfulfilled payment across its parts', async () => {
    const order = newId('tko')
    const sale = newId('sns')
    const { intentId } = await commit(async (unit) => {
      const view = unit.view()
      view.add({ sql: "INSERT INTO tickets_orders (id, amount_minor, state) VALUES (?, 700, 'held')", params: [order] })
      view.add({ sql: "INSERT INTO snacks_sales (id, amount_minor, state) VALUES (?, 300, 'released')", params: [sale] })
      return createIntent(view, { parts: [{ owner: { module: 'tickets', record: order }, amountMinor: 700 }, { owner: { module: 'snacks', record: sale }, amountMinor: 300 }], channel: 'desk', expiresAt: nowMs() + 600_000 })
    })
    const result = await inContext(() => attest({ intentId, providerAccountId: cash, method: 'cash' }))
    expect(result.unfulfilled).toBe(true)
    expect(await rows('SELECT p.owner_module, r.amount_minor, r.state FROM payments_refunds r JOIN payments_intent_parts p ON p.id = r.part_id WHERE p.intent_id = ? ORDER BY r.amount_minor', intentId))
      .toEqual([{ owner_module: 'snacks', amount_minor: 300, state: 'approved' }, { owner_module: 'tickets', amount_minor: 700, state: 'approved' }])
    sent.length = 0
  })
})

describe('the Refunds screen', () => {
  it('names who asked, says which refunds a person hands back, and counts those waiting', async () => {
    await setLimit(0)
    const asker = newId('acc')
    await env.DB.prepare("INSERT INTO core_accounts (id, name, origin, created_at) VALUES (?, 'Alex Asker', 'test', ?)").bind(asker, NOV_16).run()
    const inCash = await paidInCash(800)
    const byCard = await paidByCard(900)
    const cashRefund = await commit(unit => requestRefund(unit.view(), { partId: inCash.ticketsPart, amountMinor: 800, requestedBy: asker }))
    const cardRefund = await commit(unit => requestRefund(unit.view(), { partId: byCard.ticketsPart, amountMinor: 900, requestedBy: asker }))
    const approver = person(['payments.refund.approve'])
    const listed = await (await call(handle, 'GET', '/api/payments/refunds?state=requested', { actor: approver })).json() as any
    expect(listed.refunds.find((r: any) => r.id === cashRefund.refundId)).toMatchObject({ requestedByName: 'Alex Asker', handBack: true, method: 'cash' })
    expect(listed.refunds.find((r: any) => r.id === cardRefund.refundId)).toMatchObject({ requestedByName: 'Alex Asker', handBack: false })
    expect(await inContext(() => waitingCount.value(approver))).toBeGreaterThanOrEqual(2)
    expect(await inContext(() => waitingCount.value(person(['payments.refund.request'])))).toBe(0)
  })

  it('offers the theatre\'s reasons for declining', async () => {
    const reasons = await (await call(handle, 'GET', '/api/payments/refunds/decline-reasons', { actor: person(['payments.refund.approve']) })).json() as any
    expect(reasons.reasons.map((r: any) => r.label)).toEqual(['Outside the refund policy', 'Already refunded another way', 'Asked for twice', 'Other'])
    expect((await call(handle, 'GET', '/api/payments/refunds/decline-reasons', { actor: person([]) })).status).toBe(403)
  })
})
