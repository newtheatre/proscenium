// Practice mode at the bar (BAR-59, PM-20): bar.till opens the till on a bar outlet stocked by
// bar.stocked, with a float and the practice card reader. Selling a recipe drink and refusing a sale
// after a failed age check each tick once done; nothing reaches the real database.
import { env } from 'cloudflare:test'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, type Actor } from '#kit'
import { newId } from '#kit/ids'
import { guardOutsideCalls, setPracticeGate } from '#kit/practice/gate'
import { practiceStore } from '#kit/practice/env'
import { storeDatabase } from '#kit/practice/database'
import { practiceGate } from '../../../core/server/practice/gate'
import { ensureVocabularies } from '../../../core/server/vocabularies/service'
import { ensureSystemAccounts } from '../../../finance/server/ledger'
import start from '../../../core/server/api/core/practice/start.post'
import session from '../../../core/server/api/core/practice/session.get'
import answer from '../../../core/server/api/core/practice/calls/[id].post'
import tillSession from '../../../payments/server/api/payments/till/session.post'
import tillSale from '../../../payments/server/api/payments/till/sale.post'
import tillMethods from '../../../payments/server/api/payments/till/methods.get'
import startPayment from '../../../payments/server/api/payments/intents/[id]/start.post'
import attest from '../../../payments/server/api/payments/intents/[id]/attest.post'
import outlets from '../../server/api/bar/till/outlets.get'
import menu from '../../server/api/bar/till/menu.get'
import refusals from '../../server/api/bar/age-checks/refusals.post'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'

const handle = server({
  'POST /api/core/practice/start': start,
  'GET /api/core/practice/session': session,
  'POST /api/core/practice/calls/:id': answer,
  'POST /api/payments/till/session': tillSession,
  'POST /api/payments/till/sale': tillSale,
  'GET /api/payments/till/methods': tillMethods,
  'POST /api/payments/intents/:id/start': startPayment,
  'POST /api/payments/intents/:id/attest': attest,
  'GET /api/bar/till/outlets': outlets,
  'GET /api/bar/till/menu': menu,
  'POST /api/bar/age-checks/refusals': refusals,
})
const MARK = { 'proscenium-practice': '1', 'referer': 'http://test/practice/live/till' }
const marked = async (actor: Actor, method: string, path: string, body?: unknown) => {
  const response = await call(handle, method, path, { actor, body, headers: { ...MARK, 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as any }
}
const many = async <T>(accountId: string, sql: string, ...params: unknown[]) =>
  (await storeDatabase(practiceStore(env, accountId)).prepare(sql).bind(...params).all<T>()).results
const passed = async (me: Actor) => (await marked(me, 'GET', '/api/core/practice/session')).body.tasks.filter((t: any) => t.passedAt).map((t: any) => t.id).sort()

beforeAll(async () => {
  setPracticeGate(practiceGate)
  guardOutsideCalls()
  for (const id of ['finance', 'payments', 'bar']) await setModule(id, true)
  // What switching the bar on gives a real site: its reasons for refusing, and bar income.
  await inContext(() => ensureVocabularies('bar'))
  await inContext(async () => {
    const unit = createUnit()
    await ensureSystemAccounts(unit.view(), 'bar')
    await changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true })
    await unit.commit()
  })
  const at = Date.now()
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'cash', 'Cash', '[\"desk\"]', 'live', 1, ?, ?)").bind(newId('ppa'), at, at).run()
})
afterAll(() => setPracticeGate(undefined))

type Item = { variantId: string, product: string, ageRestricted: boolean, amountMinor: number }

/** Starts bar.till and opens the till: the outlet the bar panel opens on, its menu by product, and the ways to pay. */
async function atTheBar(me: Actor) {
  const started = await call(handle, 'POST', '/api/core/practice/start', { actor: me, body: { scenario: 'bar.till' }, headers: MARK })
  const body = await started.json() as any
  expect(started.status, JSON.stringify(body)).toBe(200)
  expect(body.to).toBe('/practice/live/till')
  const opened = await marked(me, 'POST', '/api/payments/till/session', {})
  expect(opened.status, JSON.stringify(opened.body)).toBe(200)
  const places = (await marked(me, 'GET', '/api/bar/till/outlets')).body.outlets
  expect(places).toEqual([expect.objectContaining({ kind: 'bar' })])
  const outletId = places[0].id as string
  const shown = await marked(me, 'GET', `/api/bar/till/menu?outlet=${outletId}`)
  expect(shown.status, JSON.stringify(shown.body)).toBe(200)
  const items = new Map<string, Item>(shown.body.categories.flatMap((c: any) => c.items).map((i: Item) => [i.product, i]))
  const methods = (await marked(me, 'GET', '/api/payments/till/methods')).body
  const offer = (method: string) => (methods.methods ?? methods).find((m: any) => m.method === method)
  const sell = async (item: Item, ageCheck?: 'id_checked') => {
    const input = { outletId, clientKey: newId('bkt'), lines: [{ variantId: item.variantId, quantity: 1 }], expectedTotalMinor: item.amountMinor, ...ageCheck ? { ageCheck } : {} }
    const sale = await marked(me, 'POST', '/api/payments/till/sale', { panels: [{ basket: 'bar', input }] })
    expect(sale.status, JSON.stringify(sale.body)).toBe(200)
    return sale.body.intentId as string
  }
  return { session: opened.body.session, outletId, items, offer, sell }
}

describe('practising the bar till (bar.till)', () => {
  it('opens the till on a stocked bar outlet with a recipe drink, a float and the practice card reader', async () => {
    const me = person(['core.practice.manage'])
    const before = await rows('SELECT count(*) AS n FROM bar_products')
    const bar = await atTheBar(me)
    expect(bar.session).toMatchObject({ state: 'open', floatMinor: 5000 })
    expect(bar.offer('card_reader')).toMatchObject({ provider: 'practice-reader' })
    expect([...bar.items.values()].some(i => i.ageRestricted)).toBe(true)
    expect([...bar.items.values()].some(i => !i.ageRestricted)).toBe(true)

    const id = me.accountId!
    // A mixed drink whose recipe takes two stock items, both held where the outlet sells from.
    const mixed = await many<{ variant_id: string, n: number }>(id, 'SELECT variant_id, count(*) AS n FROM bar_recipe_lines GROUP BY variant_id HAVING count(*) >= 2')
    expect(mixed.length).toBeGreaterThan(0)
    const held = await many<{ n: number }>(id, `SELECT count(*) AS n FROM bar_stock_levels l JOIN bar_outlets o ON o.stock_location_id = l.location_id
      WHERE o.id = ? AND l.quantity > 0 AND l.stock_item_id IN (SELECT stock_item_id FROM bar_recipe_lines WHERE variant_id = ?)`, bar.outletId, mixed[0]!.variant_id)
    expect(held).toEqual([{ n: 2 }])
    expect((await marked(me, 'GET', '/api/core/practice/session')).body.tasks.map((t: any) => t.id)).toEqual(['recipe-drink', 'refuse-age'])
    expect(await rows('SELECT count(*) AS n FROM bar_products')).toEqual(before)
  })

  it('ticks a recipe drink sold and a sale refused after a failed age check, and not a plain sale', async () => {
    const me = person(['core.practice.manage'])
    const bar = await atTheBar(me)
    const items = [...bar.items.values()]
    const plain = items.find(i => !i.ageRestricted)!
    const cash = bar.offer('cash')
    expect((await marked(me, 'POST', `/api/payments/intents/${await bar.sell(plain)}/attest`, { providerAccountId: cash.providerAccountId, method: 'cash', tenderedMinor: plain.amountMinor })).status).toBe(200)
    expect(await passed(me)).toEqual([])

    const [mixed] = await many<{ variant_id: string }>(me.accountId!, 'SELECT variant_id FROM bar_recipe_lines GROUP BY variant_id HAVING count(*) >= 2')
    const drink = items.find(i => i.variantId === mixed!.variant_id)!
    expect(drink.ageRestricted).toBe(true)
    // A customer turned away before anything is rung up is not this task: the age check comes first.
    const [reason] = await many<{ id: string }>(me.accountId!, "SELECT id FROM core_terms WHERE vocabulary_key = 'bar.refusal-reason' AND slug = 'under-age'")
    expect((await marked(me, 'POST', '/api/bar/age-checks/refusals', { outletId: bar.outletId, reasonTermId: reason!.id })).status).toBe(200)
    expect(await passed(me)).toEqual([])
    const refused = await marked(me, 'POST', '/api/bar/age-checks/refusals', { outletId: bar.outletId, variantId: drink.variantId, reasonTermId: reason!.id, basketKey: newId('bkt'), scope: 'restricted' })
    expect(refused.status, JSON.stringify(refused.body)).toBe(200)
    expect(await passed(me)).toEqual(['refuse-age'])

    const intentId = await bar.sell(drink, 'id_checked')
    expect((await marked(me, 'POST', `/api/payments/intents/${intentId}/start`, { providerAccountId: bar.offer('card_reader').providerAccountId, method: 'card_reader' })).status).toBe(200)
    const waiting = (await marked(me, 'GET', '/api/core/practice/session')).body.waiting
    expect((await marked(me, 'POST', `/api/core/practice/calls/${waiting[0].attemptId}`, { outcome: 'approved' })).body.state).toBe('succeeded')
    expect(await passed(me)).toEqual(['recipe-drink', 'refuse-age'])
    expect(await rows('SELECT count(*) AS n FROM bar_age_checks')).toEqual([{ n: 0 }])
  })
})
