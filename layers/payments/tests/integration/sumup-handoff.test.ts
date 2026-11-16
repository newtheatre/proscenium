// The SumUp reader by hand-off to the SumUp app (Payment Switch): the address that opens the app, the
// signed return address, what the app's answer does, and that nothing else is accepted in its place.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, nowMs, setClock } from '#kit'
import { confirmRefund, createIntent, requestRefund, startAttempt } from '../../server/services'
import returnRoute from '../../server/api/payments/handoff/[attempt]/[proof].get'
import providersRoute from '../../server/api/payments/providers.get'
import { call, env, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'

const NOV_16 = Date.UTC(2026, 10, 16, 19)
const MINUTE = 60_000
let account: string
const secrets = env as unknown as Record<string, string | undefined>
const handle = server({ 'GET /api/payments/handoff/:attempt/:proof': returnRoute, 'GET /api/payments/providers': providersRoute })

async function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T>): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}

async function handedOff(amount: number) {
  const orderId = newId('tko')
  const { intentId, partIds } = await commit(async (unit) => {
    const view = unit.view()
    view.add({ sql: "INSERT INTO tickets_orders (id, amount_minor, state) VALUES (?, ?, 'held')", params: [orderId, amount] })
    return createIntent(view, { parts: [{ owner: { module: 'tickets', record: orderId }, amountMinor: amount }], channel: 'desk', expiresAt: nowMs() + 30 * MINUTE })
  })
  const out = await inContext(() => startAttempt(intentId, { providerAccountId: account, method: 'card_reader', origin: 'https://theatre.example' }))
  const url = new URL((out.next as { url: string }).url)
  const back = new URL(url.searchParams.get('callback')!)
  return { orderId, intentId, partId: partIds[0]!, out, url, back }
}

const returnTo = (back: URL, query: Record<string, string>) => call(handle, 'GET', `${back.pathname}?${new URLSearchParams(query)}`)
const state = async (table: string, id: string) => (await rows<{ state: string }>(`SELECT state FROM ${table} WHERE id = ?`, id))[0]!.state

beforeAll(async () => {
  setClock(NOV_16)
  for (const id of ['finance', 'payments', 'tickets']) await setModule(id, true)
  await commit(unit => changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true }))
  account = newId('ppa')
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'sumup-handoff', 'SumUp app', '[\"desk\"]', 'live', 1, ?, ?)").bind(account, NOV_16, NOV_16).run()
})

afterAll(() => {
  delete secrets.PAYMENTS_SUMUP_AFFILIATE_KEY
  delete secrets.PAYMENTS_SUMUP_APP_ID
})

beforeEach(() => {
  setClock(NOV_16)
  secrets.PAYMENTS_SUMUP_AFFILIATE_KEY = 'sup_afk_test'
  secrets.PAYMENTS_SUMUP_APP_ID = 'com.example.theatre'
})

describe('the hand-off', () => {
  it('opens the SumUp app with the amount, the attempt and a signed return address', async () => {
    const { out, url, back } = await handedOff(1250)
    expect(`${url.protocol}//${url.host}${url.pathname}`).toBe('sumupmerchant://pay/1.0')
    expect(url.searchParams.get('total')).toBe('12.50')
    expect(url.searchParams.get('currency')).toBe('GBP')
    expect(url.searchParams.get('affiliate-key')).toBe('sup_afk_test')
    expect(url.searchParams.get('app-id')).toBe('com.example.theatre')
    expect(url.searchParams.get('foreign-tx-id')).toBe(out.attemptId)
    expect(back.origin).toBe('https://theatre.example')
    expect(back.pathname).toMatch(new RegExp(`^/api/payments/handoff/${out.attemptId}/[^/]+\\.[^/]+$`))
    expect(url.searchParams.get('callbacksuccess')).toBe(url.searchParams.get('callback'))
    expect(await state('payments_attempts', out.attemptId)).toBe('pending')
  })

  it('settles on the app\'s success, keeping SumUp\'s transaction code, and sends the seller back', async () => {
    const { out, back, orderId } = await handedOff(2000)
    const res = await returnTo(back, { 'smp-status': 'success', 'smp-tx-code': 'TEENSK4W2K', 'foreign-tx-id': out.attemptId })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(`/console/payments/session?attempt=${out.attemptId}&result=succeeded`)
    expect(await state('tickets_orders', orderId)).toBe('paid')
    expect((await rows('SELECT provider_ref FROM payments_attempts WHERE id = ?', out.attemptId))[0]).toEqual({ provider_ref: 'TEENSK4W2K' })
    // The same return again changes nothing.
    expect((await returnTo(back, { 'smp-status': 'failed' })).status).toBe(302)
    expect(await state('payments_attempts', out.attemptId)).toBe('succeeded')
  })

  it('fails the attempt on anything but success', async () => {
    const { out, back, orderId } = await handedOff(900)
    await returnTo(back, { 'smp-status': 'failed', 'smp-message': 'Declined' })
    expect(await state('payments_attempts', out.attemptId)).toBe('failed')
    expect(await state('tickets_orders', orderId)).toBe('held')
  })

  it('accepts no other address: another attempt\'s, a forged one, or one naming another payment', async () => {
    const first = await handedOff(500)
    const second = await handedOff(600)
    const proof = first.back.pathname.split('/').pop()!
    expect((await call(handle, 'GET', `/api/payments/handoff/${second.out.attemptId}/${proof}?smp-status=success`)).status).toBe(403)
    expect((await call(handle, 'GET', `/api/payments/handoff/${second.out.attemptId}/key.forged?smp-status=success`)).status).toBe(403)
    expect((await returnTo(second.back, { 'smp-status': 'success', 'foreign-tx-id': first.out.attemptId })).status).toBe(409)
    expect(await state('payments_attempts', second.out.attemptId)).toBe('pending')
  })

  it('is refunded in the SumUp app and confirmed here by a person', async () => {
    const { back, partId } = await handedOff(1500)
    await returnTo(back, { 'smp-status': 'success', 'smp-tx-code': 'TX2' })
    const { refundId } = await commit(unit => requestRefund(unit.view(), { partId, amountMinor: 500, requestedBy: null }))
    await commit(unit => confirmRefund(unit.view(), refundId, 'acc_seller'))
    expect(await state('payments_refunds', refundId)).toBe('succeeded')
  })
})

describe('Providers and readers', () => {
  it('pairs readers with the Cloud API only; the hand-off uses the phone\'s own app', async () => {
    const listed = await (await call(handle, 'GET', '/api/payments/providers', { actor: person(['payments.provider.manage']) })).json() as any
    const byId = Object.fromEntries(listed.providers.map((p: any) => [p.id, p]))
    expect(byId.sumup.pairsReaders).toBe(true)
    expect(byId['sumup-handoff'].pairsReaders).toBe(false)
    expect(byId.cash).toMatchObject({ pairsReaders: false, missingSecrets: [] })
  })
})
