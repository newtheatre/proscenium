// PAY-07 (Box office specification, part 4, "One payment with several owners"): the parts of an
// intent sum to it, a record has one open intent, a sale prepared and never paid is released, every
// part settles or none does, an owner's entries total its part and reach only its own accounts, and
// the one posting splits by part. The owners are the fixtures tickets and snacks.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, nowMs, setClock } from '#kit'
import { createIntent, cancelIntent, intentStatus, recordAnswer, attest } from '../../server/services'
import { releaseParts, getIntent, partsOf } from '../../server/intents'
import { expireIntent } from '../../server/tasks/expire-intents'
import { misbehave } from '../../../../tests/fixtures/modules/snacks/server/contributions/payments.settlement/snacks'
import { env, inContext, rows, setModule } from '../../../../tests/integration/helpers'

const NOV_16 = Date.UTC(2026, 10, 16, 12)
const MINUTE = 60_000
let cashAccount: string

async function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T>): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}

interface Prepared { intentId: string, orderId?: string, saleId?: string }

/** Holds a ticket order and a snack sale, as a desk basket would, and opens one intent for both. */
async function prepare(order?: { amount: number, deferred?: number, performanceId?: string }, sale?: { amount: number }, expiresIn = 15 * MINUTE): Promise<Prepared> {
  const orderId = order && newId('tko')
  const saleId = sale && newId('sns')
  const { intentId } = await commit(async (unit) => {
    const view = unit.view()
    const parts = []
    if (order) {
      view.add({ sql: "INSERT INTO tickets_orders (id, amount_minor, deferred_minor, performance_id, state) VALUES (?, ?, ?, ?, 'held')", params: [orderId, order.amount, order.deferred ?? 0, order.performanceId ?? null] })
      parts.push({ owner: { module: 'tickets', record: orderId! }, amountMinor: order.amount })
    }
    if (sale) {
      view.add({ sql: "INSERT INTO snacks_sales (id, amount_minor, state) VALUES (?, ?, 'held')", params: [saleId, sale.amount] })
      parts.push({ owner: { module: 'snacks', record: saleId! }, amountMinor: sale.amount })
    }
    return createIntent(view, { parts, channel: 'desk', expiresAt: nowMs() + expiresIn })
  })
  return { intentId, orderId, saleId }
}

const state = async (table: string, id: string) => (await rows<{ state: string }>(`SELECT state FROM ${table} WHERE id = ?`, id))[0]?.state
const postings = (intentId: string) => rows<{ id: string, idempotency_key: string, kind: string }>("SELECT * FROM finance_postings WHERE source_type = 'payments.intent' AND source_id = ? ORDER BY idempotency_key", intentId)

beforeAll(async () => {
  setClock(NOV_16)
  for (const id of ['finance', 'payments', 'tickets', 'snacks']) await setModule(id, true)
  await commit(unit => changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true }))
  cashAccount = newId('ppa')
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'cash', 'Cash', '[\"desk\"]', 'live', 1, ?, ?)").bind(cashAccount, NOV_16, NOV_16).run()
})

beforeEach(() => {
  delete misbehave.account
  delete misbehave.shortBy
})

describe('parts-sum-to-the-intent', () => {
  it('makes the intent the sum of its parts, written in one batch', async () => {
    const { intentId } = await prepare({ amount: 1500 }, { amount: 450 })
    const status = await inContext(() => intentStatus(intentId))
    expect(status).toMatchObject({ state: 'open', amountMinor: 1950, currency: 'GBP', paidMinor: 0, waiting: false })
    expect(status!.parts.map(p => [p.owner.module, p.amountMinor])).toEqual(expect.arrayContaining([['tickets', 1500], ['snacks', 450]]))
  })

  it('refuses a part that would take the parts past the intent, or join an intent no longer open', async () => {
    const { intentId } = await prepare({ amount: 1000 })
    const extra = env.DB.prepare("INSERT INTO payments_intent_parts (id, intent_id, owner_module, owner_record, open, amount_minor, created_at) VALUES (?, ?, 'snacks', ?, 1, 1, ?)")
    await expect(extra.bind(newId('pip'), intentId, newId('sns'), NOV_16).run()).rejects.toThrow(/within its amount/)
    await commit(unit => cancelIntent(unit.view(), intentId))
    await expect(env.DB.prepare('UPDATE payments_intents SET amount_minor = 2000 WHERE id = ?').bind(intentId).run()).rejects.toThrow(/keeps its amount/)
  })
})

describe('one-open-intent-per-record', () => {
  it('refuses a second open intent for the same record, and allows one once the first has gone', async () => {
    const { intentId, orderId } = await prepare({ amount: 1200 })
    await expect(commit(unit => createIntent(unit.view(), { parts: [{ owner: { module: 'tickets', record: orderId! }, amountMinor: 1200 }], channel: 'desk', expiresAt: nowMs() + MINUTE }))).rejects.toMatchObject({ code: 'payments.intent.already-open' })
    await commit(unit => cancelIntent(unit.view(), intentId))
    const again = await commit(unit => createIntent(unit.view(), { parts: [{ owner: { module: 'tickets', record: orderId! }, amountMinor: 1200 }], channel: 'desk', expiresAt: nowMs() + MINUTE }))
    expect(again.intentId).toMatch(/^pay_/)
  })
})

describe('prepare-without-payment-is-released', () => {
  it('releases every part when the intent is cancelled, and a second release changes nothing', async () => {
    const { intentId, orderId, saleId } = await prepare({ amount: 800 }, { amount: 300 })
    await commit(unit => cancelIntent(unit.view(), intentId))
    expect(await state('tickets_orders', orderId!)).toBe('released')
    expect(await state('snacks_sales', saleId!)).toBe('released')
    await commit(async (unit) => {
      const intent = (await getIntent(intentId))!
      await releaseParts(unit.view(), intent, await partsOf(intentId))
    })
    expect((await rows<{ releases: number }>('SELECT releases FROM tickets_orders WHERE id = ?', orderId))[0]!.releases).toBe(1)
    expect(await rows('SELECT open FROM payments_intent_parts WHERE intent_id = ?', intentId)).toEqual([{ open: null }, { open: null }])
  })

  it('expires an intent past its time with nothing waiting, and releases its parts', async () => {
    const { intentId, orderId } = await prepare({ amount: 700 }, undefined, MINUTE)
    await inContext(() => expireIntent(intentId))
    expect(await state('payments_intents', intentId)).toBe('open')
    setClock(NOV_16 + 2 * MINUTE)
    try {
      await inContext(() => expireIntent(intentId))
    }
    finally {
      setClock(NOV_16)
    }
    expect(await state('payments_intents', intentId)).toBe('expired')
    expect(await state('tickets_orders', orderId!)).toBe('released')
  })

  it('does not cancel an intent once money has been taken for it', async () => {
    const { intentId } = await prepare({ amount: 1000 })
    await inContext(() => attest({ intentId, providerAccountId: cashAccount, method: 'cash', amountMinor: 400 }))
    await expect(commit(unit => cancelIntent(unit.view(), intentId))).rejects.toMatchObject({ code: 'payments.intent.in-flight' })
  })
})

describe('posting-splits-by-part', () => {
  it('settles every part and writes one sealed posting: the money in, and each owner\'s own entries', async () => {
    const { intentId, orderId, saleId } = await prepare({ amount: 2000, deferred: 1200, performanceId: 'sp_hamlet' }, { amount: 550 })
    const result = await inContext(() => attest({ intentId, providerAccountId: cashAccount, method: 'cash', tenderedMinor: 3000 }))
    expect(result).toMatchObject({ settled: true, unfulfilled: false, changeMinor: 450 })
    expect(await state('payments_intents', intentId)).toBe('succeeded')
    expect(await state('tickets_orders', orderId!)).toBe('paid')
    expect(await state('snacks_sales', saleId!)).toBe('sold')
    const [posting, ...others] = await postings(intentId)
    expect(others).toEqual([])
    expect(posting).toMatchObject({ idempotency_key: `payments:intent:${intentId}:paid`, kind: 'sale' })
    const entries = await rows<{ system_key: string, amount_minor: number, for_module: string | null, performance_id: string | null }>(
      'SELECT a.system_key, e.amount_minor, e.for_module, e.performance_id FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE e.posting_id = ? ORDER BY e.amount_minor DESC', posting!.id)
    expect(entries).toEqual([
      { system_key: 'payments.cash', amount_minor: 2550, for_module: null, performance_id: null },
      { system_key: 'snacks.income', amount_minor: -550, for_module: 'snacks', performance_id: null },
      { system_key: 'tickets.income', amount_minor: -800, for_module: 'tickets', performance_id: 'sp_hamlet' },
      { system_key: 'tickets.deferred', amount_minor: -1200, for_module: 'tickets', performance_id: 'sp_hamlet' },
    ])
    expect((await rows('SELECT count(*) AS n FROM finance_seals WHERE posting_id = ?', posting!.id))[0]).toEqual({ n: 1 })
    expect(await rows('SELECT count(*) AS n FROM payments_intent_parts WHERE intent_id = ? AND settled_at IS NOT NULL', intentId)).toEqual([{ n: 2 }])
  })

  it('settles once the split payments add up, with one money line for each', async () => {
    const { intentId, orderId } = await prepare({ amount: 1000 })
    const first = await inContext(() => attest({ intentId, providerAccountId: cashAccount, method: 'cash', amountMinor: 600 }))
    expect(first.settled).toBe(false)
    expect(await state('tickets_orders', orderId!)).toBe('held')
    await expect(inContext(() => attest({ intentId, providerAccountId: cashAccount, method: 'cash', amountMinor: 600 }))).rejects.toMatchObject({ code: 'payments.attempt.bad-amount' })
    const second = await inContext(() => attest({ intentId, providerAccountId: cashAccount, method: 'cash' }))
    expect(second.settled).toBe(true)
    const [posting] = await postings(intentId)
    expect(await rows("SELECT e.amount_minor FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE e.posting_id = ? AND a.system_key = 'payments.cash' ORDER BY e.amount_minor", posting!.id)).toEqual([{ amount_minor: 400 }, { amount_minor: 600 }])
  })

  it('nothing-posts-twice: the same answer heard again changes nothing', async () => {
    const { intentId } = await prepare({ amount: 900 })
    const { attemptId } = await inContext(() => attest({ intentId, providerAccountId: cashAccount, method: 'cash' }))
    expect(await inContext(() => recordAnswer(attemptId, { state: 'succeeded' }, { kind: 'poll' }))).toMatchObject({ changed: false, settled: false })
    expect(await postings(intentId)).toHaveLength(1)
    await expect(env.DB.prepare("UPDATE payments_attempts SET state = 'failed' WHERE id = ?").bind(attemptId).run()).rejects.toThrow(/moves only forward/)
  })

  it('records a declined card machine without settling anything', async () => {
    const { intentId, orderId } = await prepare({ amount: 500 })
    const machine = newId('ppa')
    await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'attested-card', 'Card machine', '[\"desk\"]', 'live', 1, ?, ?)").bind(machine, NOV_16, NOV_16).run()
    const declined = await inContext(() => attest({ intentId, providerAccountId: machine, method: 'card_attested', succeeded: false }))
    expect(declined.settled).toBe(false)
    expect(await state('payments_attempts', declined.attemptId)).toBe('failed')
    expect(await state('tickets_orders', orderId!)).toBe('held')
    const paid = await inContext(() => attest({ intentId, providerAccountId: machine, method: 'card_attested' }))
    expect(paid.settled).toBe(true)
    const [posting] = await postings(intentId)
    expect(await rows('SELECT a.system_key, a.scope FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE e.posting_id = ? AND e.amount_minor > 0', posting!.id)).toEqual([{ system_key: 'payments.card-clearing', scope: machine }])
  })
})

/** Settles with cash and expects the unfulfilled batch instead: money held, every part released. */
async function expectUnfulfilled(prepared: Prepared, amount: number) {
  const result = await inContext(() => attest({ intentId: prepared.intentId, providerAccountId: cashAccount, method: 'cash' }))
  expect(result).toMatchObject({ settled: false, unfulfilled: true })
  expect(await state('payments_intents', prepared.intentId)).toBe('unfulfilled')
  expect(await state('payments_attempts', result.attemptId)).toBe('succeeded')
  const all = await postings(prepared.intentId)
  expect(all.map(p => p.kind)).toEqual(['unfulfilled'])
  expect(await rows('SELECT a.system_key, e.amount_minor FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE e.posting_id = ? ORDER BY e.amount_minor DESC', all[0]!.id))
    .toEqual([{ system_key: 'payments.cash', amount_minor: amount }, { system_key: 'payments.unfulfilled', amount_minor: -amount }])
  if (prepared.orderId) expect(await state('tickets_orders', prepared.orderId)).toBe('released')
  expect(await rows('SELECT count(*) AS n FROM payments_intent_parts WHERE intent_id = ? AND (open IS NOT NULL OR settled_at IS NOT NULL)', prepared.intentId)).toEqual([{ n: 0 }])
}

describe('all-parts-settle-or-none', () => {
  it('settles nothing when one owner refuses after the money was taken: the intent is unfulfilled', async () => {
    const prepared = await prepare({ amount: 1500 }, { amount: 300 })
    await env.DB.prepare("UPDATE snacks_sales SET state = 'released' WHERE id = ?").bind(prepared.saleId).run()
    await expectUnfulfilled(prepared, 1800)
  })
})

describe('part-entries-must-total-the-part', () => {
  it('refuses an owner whose entries do not total its part, and settles nothing', async () => {
    misbehave.shortBy = 50
    const prepared = await prepare({ amount: 1000 }, { amount: 250 })
    await expectUnfulfilled(prepared, 1250)
    expect(await state('snacks_sales', prepared.saleId!)).toBe('released')
  })
})

describe('handler-posts-only-to-its-own-accounts', () => {
  it('refuses an owner whose entries reach another module\'s account, and settles nothing', async () => {
    misbehave.account = 'tickets.income'
    const prepared = await prepare({ amount: 600 }, { amount: 200 })
    await expectUnfulfilled(prepared, 800)
  })
})
