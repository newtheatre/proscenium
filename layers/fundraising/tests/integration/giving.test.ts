// Fundraising slice 1 (FR-01, FR-02, FR-05 to FR-08, FR-17; rules D1, D4, D5, D8, M1): switching on
// makes the general fund and its account; funds keep one default and their restriction once given
// to; a gift online is pending until Payments settles it, then received with a reference, credited
// to its fund and thanked once; a refund reverses it; an unfinished payment leaves it abandoned.
import { env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, setClock } from '#kit'
import { recordAnswer } from '../../../payments/server/services'
import { call, inContext, person, rows, saveKey, server, setModule } from '../../../../tests/integration/helpers'
import defaultFund from '../../server/listeners/default-fund'
import settlement from '../../server/contributions/payments.settlement/fundraising'
import fundsGet from '../../server/api/fundraising/funds/index.get'
import fundsPost from '../../server/api/fundraising/funds/index.post'
import fundPatch from '../../server/api/fundraising/funds/[id].patch'
import optionsGet from '../../server/api/fundraising/give/options.get'
import givePost from '../../server/api/fundraising/give/index.post'
import thanksGet from '../../server/api/fundraising/give/[token]/index.get'
import payPost from '../../server/api/fundraising/give/[token]/pay.post'
import checkPost from '../../server/api/fundraising/give/[token]/check.post'
import donationsGet from '../../server/api/fundraising/donations/index.get'
import donationGet from '../../server/api/fundraising/donations/[id].get'

const NOV_24 = Date.UTC(2026, 10, 24, 12) // not-policy: a test's moment
const handle = server({
  'GET /api/fundraising/funds': fundsGet,
  'POST /api/fundraising/funds': fundsPost,
  'PATCH /api/fundraising/funds/:id': fundPatch,
  'GET /api/fundraising/give/options': optionsGet,
  'POST /api/fundraising/give': givePost,
  'GET /api/fundraising/give/:token': thanksGet,
  'POST /api/fundraising/give/:token/pay': payPost,
  'POST /api/fundraising/give/:token/check': checkPost,
  'GET /api/fundraising/donations': donationsGet,
  'GET /api/fundraising/donations/:id': donationGet,
})
const treasurer = person(['fundraising.fund.manage', 'fundraising.donation.view'])
const anonymous = null

async function req<T = any>(method: string, path: string, body?: unknown, actor: ReturnType<typeof person> | null = treasurer): Promise<{ status: number, body: T }> {
  const response = await call(handle, method, path, { actor: actor ?? undefined, body, headers: method === 'GET' ? {} : { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as T }
}

async function commit(write: (unit: ReturnType<ReturnType<typeof createUnit>['view']>) => unknown) {
  await inContext(async () => {
    const unit = createUnit()
    await write(unit.view())
    await unit.commit()
  })
}

let provider = ''
beforeAll(async () => {
  setClock(NOV_24)
  // The bot check is the kit's, tested there; here it is off, as it is with no secret saved.
  await saveKey('CORE_TURNSTILE_SECRET_KEY', null)
  await commit(unit => changeSetting(unit, 'core.locale.time-zone', 'Europe/London', { confirm: true }))
  for (const id of ['finance', 'payments', 'fundraising', 'cardco']) await setModule(id, true)
  provider = newId('ppa')
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'cardco', 'CardCo', '[\"online\"]', 'live', 1, ?, ?)").bind(provider, NOV_24, NOV_24).run()
  await commit(unit => defaultFund({ payload: { moduleId: 'fundraising' } } as never, unit))
  await commit(unit => defaultFund({ payload: { moduleId: 'fundraising' } } as never, unit))
})

const general = async () => (await rows<{ id: string }>('SELECT id FROM fundraising_funds WHERE is_default = 1'))[0]!.id
const credited = async (fundId: string) => (await rows<{ total: number | null }>(
  "SELECT sum(e.amount_minor) AS total FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE a.system_key = 'fundraising.donations' AND a.scope = ?", fundId))[0]!.total ?? 0

/** Gives online and has CardCo answer. */
async function give(body: Record<string, unknown>, actor: ReturnType<typeof person> | null, state: 'succeeded' | 'failed' = 'succeeded') {
  const started = await req('POST', '/api/fundraising/give', body, actor)
  expect(started.status, JSON.stringify(started.body)).toBe(200)
  const token = started.body.token as string
  const paying = await req('POST', `/api/fundraising/give/${token}/pay`, {}, actor)
  expect(paying.status, JSON.stringify(paying.body)).toBe(200)
  await inContext(() => recordAnswer(paying.body.attemptId, state === 'succeeded' ? { state, providerRef: `cc_${paying.body.attemptId}` } : { state, failureCode: 'declined' }, { kind: 'poll' }))
  const id = (await rows<{ id: string }>('SELECT id FROM fundraising_donations ORDER BY created_at DESC, id DESC LIMIT 1'))[0]!.id
  return { token, id }
}

describe('funds', () => {
  it('makes one general fund with its own account when switched on, however often', async () => {
    expect(await rows('SELECT name, is_default AS isDefault, offered FROM fundraising_funds')).toEqual([{ name: 'General fund', isDefault: 1, offered: 1 }])
    expect(await rows("SELECT code, kind, module FROM finance_accounts WHERE system_key = 'fundraising.donations' AND scope = ?", await general()))
      .toEqual([{ code: `fundraising.donations.${await general()}`, kind: 'income', module: 'fundraising' }])
  })

  it('needs a purpose for a restricted fund, refuses a name in use, and keeps one default', async () => {
    expect((await req('POST', '/api/fundraising/funds', { name: 'Roof appeal', purpose: null, restricted: true, offered: true })).body.code).toBe('fundraising.fund.purpose-needed')
    expect((await req('POST', '/api/fundraising/funds', { name: 'general FUND', purpose: null, restricted: false, offered: true })).body.code).toBe('fundraising.fund.name-taken')
    expect((await req('POST', '/api/fundraising/funds', { name: 'Roof', purpose: null, restricted: false, offered: true }, person([]))).status).toBe(403)
    const roof = (await req('POST', '/api/fundraising/funds', { name: 'Roof appeal', purpose: 'A new roof for the studio', restricted: true, offered: true })).body.fundId as string
    expect(await rows("SELECT name FROM finance_accounts WHERE system_key = 'fundraising.donations' AND scope = ?", roof)).toEqual([{ name: 'Donations: Roof appeal' }])

    const first = await general()
    expect((await req('PATCH', `/api/fundraising/funds/${first}`, { archived: true })).body.code).toBe('fundraising.fund.default')
    expect((await req('PATCH', `/api/fundraising/funds/${roof}`, { isDefault: true })).status).toBe(200)
    expect(await general()).toBe(roof)
    expect((await req('PATCH', `/api/fundraising/funds/${first}`, { archived: true })).status).toBe(200)
    expect((await req('PATCH', `/api/fundraising/funds/${first}`, { archived: false })).status).toBe(200)
    expect((await req('PATCH', `/api/fundraising/funds/${first}`, { isDefault: true })).status).toBe(200)
    const listed = (await req('GET', '/api/fundraising/funds')).body.funds as { name: string, isDefault: boolean }[]
    expect(listed.filter(f => f.isDefault).map(f => f.name)).toEqual(['General fund'])
  })
})

describe('giving online', () => {
  it('offers the amounts, limits and the funds donors may choose, to anyone', async () => {
    const hidden = (await req('POST', '/api/fundraising/funds', { name: 'Not offered', purpose: null, restricted: false, offered: false })).body.fundId as string
    const options = await req('GET', '/api/fundraising/give/options', undefined, anonymous)
    expect(options.body).toMatchObject({ presets: [500, 1000, 2500, 5000], minMinor: 100, maxMinor: 500000, currency: 'GBP', online: true })
    expect(options.body.funds[0]).toMatchObject({ name: 'General fund', isDefault: true })
    expect(options.body.funds.map((f: { id: string }) => f.id)).not.toContain(hidden)
    expect((await req('POST', '/api/fundraising/give', { amountMinor: 1000, fundId: hidden, email: 'a@example.com' }, anonymous)).body.code).toBe('fundraising.give.fund-closed')
  })

  it('refuses an amount outside the limits, and a guest with no email', async () => {
    expect((await req('POST', '/api/fundraising/give', { amountMinor: 50, email: 'a@example.com' }, anonymous)).body.code).toBe('fundraising.give.too-small')
    expect((await req('POST', '/api/fundraising/give', { amountMinor: 500001, email: 'a@example.com' }, anonymous)).body.code).toBe('fundraising.give.too-large')
    expect((await req('POST', '/api/fundraising/give', { amountMinor: 1000 }, anonymous)).body.code).toBe('fundraising.give.email-needed')
  })

  it('receives a guest\'s gift when the money arrives: a reference, its fund credited, thanked once', async () => {
    const fund = await general()
    const before = await credited(fund)
    const { token, id } = await give({ amountMinor: 2500, email: 'Donor@Example.com', name: 'Dana Donor', acknowledgeAs: 'The Donor family', message: 'Break a leg' }, anonymous)
    expect((await rows('SELECT state, reference, received_on AS receivedOn, contact_email AS email, account_id AS accountId, channel FROM fundraising_donations WHERE id = ?', id))[0])
      .toEqual({ state: 'received', reference: expect.stringMatching(/^G-\d{4}$/), receivedOn: '2026-11-24', email: 'donor@example.com', accountId: null, channel: 'online' })
    expect(await credited(fund)).toBe(before - 2500)
    expect(await rows("SELECT count(*) AS n FROM core_notifications WHERE type_key = 'fundraising.donation-thanks'")).toEqual([{ n: 1 }])
    expect(await rows("SELECT count(*) AS n FROM core_events WHERE name = 'fundraising.donation.received'")).toEqual([{ n: 1 }])

    const thanks = await req('GET', `/api/fundraising/give/${token}`, undefined, anonymous)
    expect(thanks.body).toEqual({ state: 'received', reference: expect.stringMatching(/^G-/), amountMinor: 2500, currency: 'GBP', fund: 'General fund', receivedOn: '2026-11-24' })
    expect((await req('GET', '/api/fundraising/give/not-a-real-token', undefined, anonymous)).status).toBe(404)
    expect((await req('POST', `/api/fundraising/give/${token}/pay`, {}, anonymous)).body.code).toBe('fundraising.give.not-waiting')
    expect((await req('POST', `/api/fundraising/give/${token}/check`, {}, anonymous)).status).toBe(200)

    // The second gift takes the next reference.
    const next = await give({ amountMinor: 1000, email: 'other@example.com' }, anonymous)
    const refs = await rows<{ reference: string }>('SELECT reference FROM fundraising_donations WHERE id IN (?, ?) ORDER BY reference', id, next.id)
    expect(Number(refs[1]!.reference.slice(2)) - Number(refs[0]!.reference.slice(2))).toBe(1)
  })

  it('puts a signed-in donor\'s gift on their account, into the fund they chose, which stays restricted', async () => {
    const roof = (await rows<{ id: string }>("SELECT id FROM fundraising_funds WHERE name = 'Roof appeal'"))[0]!.id
    const donor = person([])
    const { id } = await give({ amountMinor: 5000, fundId: roof }, donor)
    expect((await rows('SELECT account_id AS accountId, fund_id AS fundId, state FROM fundraising_donations WHERE id = ?', id))[0]).toEqual({ accountId: donor.accountId, fundId: roof, state: 'received' })
    expect(await credited(roof)).toBe(-5000)
    expect((await req('PATCH', `/api/fundraising/funds/${roof}`, { name: 'Roof appeal', purpose: 'A new roof', restricted: false, offered: true })).body.code).toBe('fundraising.fund.restriction-fixed')
    expect((await req('PATCH', `/api/fundraising/funds/${roof}`, { name: 'Roof appeal', purpose: 'A new roof', restricted: true, offered: true })).status).toBe(200)
  })

  it('leaves a gift whose payment never completed abandoned, and refunds reverse the income', async () => {
    const fund = await general()
    const failed = await give({ amountMinor: 700, email: 'try@example.com' }, anonymous, 'failed')
    const part = (await rows<{ id: string, intent_id: string }>('SELECT id, intent_id FROM payments_intent_parts WHERE owner_record = ?', failed.id))[0]!
    const asPart = { id: part.id, intentId: part.intent_id, record: failed.id, amountMinor: 700, currency: 'GBP' }
    await commit(unit => settlement.release(unit, asPart))
    await commit(unit => settlement.release(unit, asPart))
    expect((await rows('SELECT state FROM fundraising_donations WHERE id = ?', failed.id))[0]).toEqual({ state: 'abandoned' })

    const { id } = await give({ amountMinor: 2000, email: 'refund@example.com' }, anonymous)
    const paid = (await rows<{ id: string, intent_id: string }>('SELECT id, intent_id FROM payments_intent_parts WHERE owner_record = ?', id))[0]!
    const given = { id: paid.id, intentId: paid.intent_id, record: id, amountMinor: 2000, currency: 'GBP' }
    let entries: unknown
    await commit(async (unit) => { entries = await settlement.refunded(unit, given, { id: 'rf1', amountMinor: 500 }) })
    expect(entries).toEqual([{ account: { key: 'fundraising.donations', scope: fund }, amountMinor: 500, productionId: null }])
    expect((await rows('SELECT state, refunded_minor AS refunded FROM fundraising_donations WHERE id = ?', id))[0]).toEqual({ state: 'received', refunded: 500 })
    await commit(unit => settlement.refunded(unit, given, { id: 'rf2', amountMinor: 1500 }))
    expect((await rows('SELECT state, refunded_minor AS refunded FROM fundraising_donations WHERE id = ?', id))[0]).toEqual({ state: 'refunded', refunded: 2000 })
    await expect(commit(unit => settlement.refunded(unit, given, { id: 'rf3', amountMinor: 1 }))).rejects.toThrow()
  })
})

describe('the donations list', () => {
  it('shows received gifts to those who may see them, searched by donor, and one gift in full', async () => {
    expect((await req('GET', '/api/fundraising/donations', undefined, person([]))).status).toBe(403)
    const listed = await req('GET', '/api/fundraising/donations')
    expect(listed.status, JSON.stringify(listed.body)).toBe(200)
    const all = listed.body.donations as { id: string, donor: string | null, state: string }[]
    expect(all.every(d => d.state === 'received' || d.state === 'refunded')).toBe(true)
    const found = (await req('GET', '/api/fundraising/donations?q=dana')).body.donations as { id: string, donor: string }[]
    expect(found.map(d => d.donor)).toEqual(['Dana Donor'])
    expect((await req('GET', '/api/fundraising/donations?state=abandoned')).body.donations).toHaveLength(1)
    const one = await req('GET', `/api/fundraising/donations/${found[0]!.id}`)
    expect(one.body.donation).toMatchObject({ donor: 'Dana Donor', email: 'donor@example.com', acknowledgeAs: 'The Donor family', message: 'Break a leg', fund: 'General fund', channel: 'online' })
    expect(await inContext(async () => (await settlement.describe!(found[0]!.id)))).toMatchObject({ reference: expect.stringMatching(/^G-/), buyer: 'Dana Donor', to: `/console/fundraising/donations/${found[0]!.id}` })
  })
})
