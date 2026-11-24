// Fundraising campaigns (FR-09 to FR-12; rules K1 to K3, D4): a campaign is a draft until published,
// opens and closes by its times, takes gifts into its own fund, counts what it raised, marks its
// target once, and lists the names of donors who chose to be named, with an amount only by consent.
import { env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, setClock } from '#kit'
import { recordAnswer } from '../../../payments/server/services'
import { call, inContext, person, rows, saveKey, server, setModule } from '../../../../tests/integration/helpers'
import defaultFund from '../../server/listeners/default-fund'
import campaignTarget from '../../server/listeners/campaign-target'
import openClose from '../../server/tasks/open-close-campaigns'
import fundsPost from '../../server/api/fundraising/funds/index.post'
import campaignsGet from '../../server/api/fundraising/campaigns/index.get'
import campaignsPost from '../../server/api/fundraising/campaigns/index.post'
import campaignGet from '../../server/api/fundraising/campaigns/[id]/index.get'
import campaignPatch from '../../server/api/fundraising/campaigns/[id]/index.patch'
import supportGet from '../../server/api/fundraising/support/index.get'
import supportCampaignGet from '../../server/api/fundraising/support/[slug].get'
import optionsGet from '../../server/api/fundraising/give/options.get'
import givePost from '../../server/api/fundraising/give/index.post'
import payPost from '../../server/api/fundraising/give/[token]/pay.post'
import donationsGet from '../../server/api/fundraising/donations/index.get'

const NOV_24 = Date.UTC(2026, 10, 24, 12) // not-policy: a test's moment
const HOUR = 3_600_000 // not-policy: an hour in milliseconds
const handle = server({
  'POST /api/fundraising/funds': fundsPost,
  'GET /api/fundraising/campaigns': campaignsGet,
  'POST /api/fundraising/campaigns': campaignsPost,
  'GET /api/fundraising/campaigns/:id': campaignGet,
  'PATCH /api/fundraising/campaigns/:id': campaignPatch,
  'GET /api/fundraising/support': supportGet,
  'GET /api/fundraising/support/:slug': supportCampaignGet,
  'GET /api/fundraising/give/options': optionsGet,
  'POST /api/fundraising/give': givePost,
  'POST /api/fundraising/give/:token/pay': payPost,
  'GET /api/fundraising/donations': donationsGet,
})
const lead = person(['fundraising.campaign.manage', 'fundraising.fund.manage', 'fundraising.donation.view'])
const visitor = null

async function req<T = any>(method: string, path: string, body?: unknown, actor: ReturnType<typeof person> | null = lead): Promise<{ status: number, body: T }> {
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

/** Runs the module's own listener for each target-relevant event, as the dispatcher would. */
async function dispatchReceived() {
  const events = await rows<{ payload: string }>("SELECT payload FROM core_events WHERE name = 'fundraising.donation.received' ORDER BY announced_at")
  for (const e of events) await commit(unit => campaignTarget({ payload: JSON.parse(e.payload) } as never, unit))
}

let provider = ''
let general = ''
let roof = ''
beforeAll(async () => {
  setClock(NOV_24)
  await saveKey('CORE_TURNSTILE_SECRET_KEY', null)
  await commit(unit => changeSetting(unit, 'core.locale.time-zone', 'Europe/London', { confirm: true }))
  for (const id of ['finance', 'payments', 'fundraising', 'cardco']) await setModule(id, true)
  provider = newId('ppa')
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'cardco', 'CardCo', '[\"online\"]', 'live', 1, ?, ?)").bind(provider, NOV_24, NOV_24).run()
  await commit(unit => defaultFund({ payload: { moduleId: 'fundraising' } } as never, unit))
  general = (await rows<{ id: string }>('SELECT id FROM fundraising_funds WHERE is_default = 1'))[0]!.id
  const made = await req('POST', '/api/fundraising/funds', { name: 'Roof appeal', purpose: 'Mending the roof', restricted: true, offered: false })
  roof = made.body.fundId
})

const fields = (over: Record<string, unknown> = {}) => ({
  slug: 'mend-the-roof', title: 'Mend the roof', summary: 'Help us keep the rain off the stage.', body: 'The roof **leaks**.',
  fundId: roof, productionId: null, targetMinor: 50000, offsetMinor: 0, offsetNote: null,
  opensAt: NOV_24 - HOUR, closesAt: null, listNames: true, listAmounts: 'band', ...over,
})

async function give(body: Record<string, unknown>) {
  const started = await req('POST', '/api/fundraising/give', { email: 'donor@example.org', ...body }, visitor)
  expect(started.status, JSON.stringify(started.body)).toBe(200)
  const paying = await req('POST', `/api/fundraising/give/${started.body.token}/pay`, {}, visitor)
  expect(paying.status, JSON.stringify(paying.body)).toBe(200)
  await inContext(() => recordAnswer(paying.body.attemptId, { state: 'succeeded', providerRef: `cc_${paying.body.attemptId}` }, { kind: 'poll' }))
  return (await rows<{ id: string }>('SELECT id FROM fundraising_donations ORDER BY created_at DESC, id DESC LIMIT 1'))[0]!.id
}

describe('making a campaign (FR-10)', () => {
  it('starts as a draft that the public cannot see, with defaults from the settings', async () => {
    const made = await req('POST', '/api/fundraising/campaigns', fields())
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    const { body } = await req('GET', `/api/fundraising/campaigns/${made.body.campaignId}`)
    expect(body.campaign).toMatchObject({ state: 'draft', showTotal: true, countGiftAid: false, raisedMinor: 0, fund: 'Roof appeal', currency: 'GBP' })
    expect((await req('GET', '/api/fundraising/support/mend-the-roof', undefined, visitor)).status).toBe(404)
    expect((await req('GET', '/api/fundraising/support', undefined, visitor)).body.campaigns).toEqual([])
  })

  it('refuses a taken or reserved address, a close before the open and an offset with no note', async () => {
    expect((await req('POST', '/api/fundraising/campaigns', fields())).body.code).toBe('fundraising.campaign.slug-taken')
    expect((await req('POST', '/api/fundraising/campaigns', fields({ slug: 'give' }))).body.code).toBe('fundraising.campaign.slug-reserved')
    expect((await req('POST', '/api/fundraising/campaigns', fields({ slug: 'early', closesAt: NOV_24 - 2 * HOUR }))).body.code).toBe('fundraising.campaign.closes-first')
    expect((await req('POST', '/api/fundraising/campaigns', fields({ slug: 'offset', offsetMinor: 1000 }))).body.code).toBe('fundraising.campaign.offset-note')
    expect((await req('POST', '/api/fundraising/campaigns', fields({ slug: 'Not A Slug!' }))).status).toBe(422)
  })

  it('needs the ability to manage campaigns', async () => {
    expect((await req('POST', '/api/fundraising/campaigns', fields({ slug: 'other' }), person(['fundraising.donation.view']))).status).toBe(403)
  })
})

describe('publishing, opening and closing (FR-10)', () => {
  it('opens at once when its opening time has passed, and appears on the Support page', async () => {
    const id = (await rows<{ id: string }>("SELECT id FROM fundraising_campaigns WHERE slug = 'mend-the-roof'"))[0]!.id
    expect((await req('PATCH', `/api/fundraising/campaigns/${id}`, { step: 'publish' })).status).toBe(200)
    const page = await req('GET', '/api/fundraising/support/mend-the-roof', undefined, visitor)
    expect(page.body.campaign).toMatchObject({ state: 'open', title: 'Mend the roof', fund: { id: roof, name: 'Roof appeal' }, progress: { raisedMinor: 0, targetMinor: 50000 }, names: [] })
    const support = await req('GET', '/api/fundraising/support', undefined, visitor)
    expect(support.body.campaigns.map((c: { slug: string }) => c.slug)).toEqual(['mend-the-roof'])
    expect(await rows("SELECT 1 FROM core_events WHERE name = 'fundraising.campaign.opened'")).toHaveLength(1)
  })

  it('waits for a later opening time, then the task opens it and closes it at its end', async () => {
    const made = await req('POST', '/api/fundraising/campaigns', fields({ slug: 'new-seats', title: 'New seats', opensAt: NOV_24 + HOUR, closesAt: NOV_24 + 3 * HOUR }))
    const id = made.body.campaignId
    await req('PATCH', `/api/fundraising/campaigns/${id}`, { step: 'publish' })
    expect((await req('GET', `/api/fundraising/campaigns/${id}`)).body.campaign).toMatchObject({ state: 'draft', publishedAt: NOV_24 })
    setClock(NOV_24 + 2 * HOUR)
    await commit(unit => openClose(unit))
    expect((await req('GET', '/api/fundraising/support/new-seats', undefined, visitor)).body.campaign.state).toBe('open')
    setClock(NOV_24 + 4 * HOUR)
    await commit(unit => openClose(unit))
    const closed = await req('GET', '/api/fundraising/support/new-seats', undefined, visitor)
    expect(closed.body.campaign).toMatchObject({ state: 'closed', fund: { name: 'Roof appeal' } })
    expect((await req('GET', '/api/fundraising/support', undefined, visitor)).body.campaigns.map((c: { slug: string }) => c.slug)).toEqual(['mend-the-roof'])
    // Reopening clears a closing time that has passed, so the task does not close it again.
    await req('PATCH', `/api/fundraising/campaigns/${id}`, { step: 'reopen' })
    await commit(unit => openClose(unit))
    expect((await req('GET', `/api/fundraising/campaigns/${id}`)).body.campaign).toMatchObject({ state: 'open', closesAt: null })
    await req('PATCH', `/api/fundraising/campaigns/${id}`, { step: 'close' })
    await req('PATCH', `/api/fundraising/campaigns/${id}`, { step: 'archive' })
    expect((await req('GET', '/api/fundraising/support/new-seats', undefined, visitor)).status).toBe(404)
    expect((await req('PATCH', `/api/fundraising/campaigns/${id}`, { step: 'close' })).body.code).toBe('fundraising.campaign.wrong-state')
    setClock(NOV_24)
  })
})

describe('giving to a campaign (D4, K1, K2, K3)', () => {
  let campaignId = ''
  beforeAll(async () => {
    campaignId = (await rows<{ id: string }>("SELECT id FROM fundraising_campaigns WHERE slug = 'mend-the-roof'"))[0]!.id
  })

  it('offers the campaign on the Give page and puts the gift in its fund, whatever fund is sent', async () => {
    const options = await req('GET', '/api/fundraising/give/options?campaign=mend-the-roof', undefined, visitor)
    expect(options.body.campaign).toMatchObject({ id: campaignId, open: true, fund: { id: roof }, listAmounts: 'band', listNames: true })
    const id = await give({ amountMinor: 7500, campaignId, fundId: general, acknowledgeAs: 'The Smiths', showAmount: true })
    const [gift] = await rows<{ fund_id: string, campaign_id: string, show_amount: number }>('SELECT fund_id, campaign_id, show_amount FROM fundraising_donations WHERE id = ?', id)
    expect(gift).toEqual({ fund_id: roof, campaign_id: campaignId, show_amount: 1 })
  })

  it('counts received gifts and the offset toward raised, and lists names with bands only by consent', async () => {
    await give({ amountMinor: 2000, campaignId, acknowledgeAs: 'A friend', showAmount: false })
    await give({ amountMinor: 3000, campaignId })
    const c = (await req('GET', `/api/fundraising/campaigns/${campaignId}`)).body.campaign
    await req('PATCH', `/api/fundraising/campaigns/${campaignId}`, { ...fields(), offsetMinor: 1000, offsetNote: 'Raffle at the summer party', showTotal: c.showTotal, countGiftAid: c.countGiftAid })
    const page = (await req('GET', '/api/fundraising/support/mend-the-roof', undefined, visitor)).body.campaign
    expect(page.progress).toEqual({ raisedMinor: 13500, targetMinor: 50000, currency: 'GBP' })
    expect(page.names).toEqual([
      { name: 'A friend', amountMinor: null, band: null },
      { name: 'The Smiths', amountMinor: null, band: { fromMinor: 5000, toMinor: 9999 } },
    ])
    await req('PATCH', `/api/fundraising/campaigns/${campaignId}`, { ...fields(), listAmounts: 'exact', offsetMinor: 1000, offsetNote: 'Raffle at the summer party' })
    const exact = (await req('GET', '/api/fundraising/support/mend-the-roof', undefined, visitor)).body.campaign
    expect(exact.names[1]).toEqual({ name: 'The Smiths', amountMinor: 7500, band: null })
  })

  it('hides the total and names when the campaign says so', async () => {
    await req('PATCH', `/api/fundraising/campaigns/${campaignId}`, { ...fields(), showTotal: false, listNames: false, offsetMinor: 1000, offsetNote: 'Raffle at the summer party' })
    const page = (await req('GET', '/api/fundraising/support/mend-the-roof', undefined, visitor)).body.campaign
    expect(page).toMatchObject({ progress: null, names: null })
    await req('PATCH', `/api/fundraising/campaigns/${campaignId}`, { ...fields(), showTotal: true, offsetMinor: 1000, offsetNote: 'Raffle at the summer party' })
  })

  it('marks the target once, when a gift first takes raised to it, and tells the campaign\'s people', async () => {
    await dispatchReceived()
    expect((await req('GET', `/api/fundraising/campaigns/${campaignId}`)).body.campaign.targetReachedAt).toBeNull()
    await give({ amountMinor: 40000, campaignId })
    await dispatchReceived()
    await dispatchReceived()
    expect((await req('GET', `/api/fundraising/campaigns/${campaignId}`)).body.campaign.targetReachedAt).toBe(NOV_24)
    expect(await rows("SELECT 1 FROM core_events WHERE name = 'fundraising.campaign.target-reached'")).toHaveLength(1)
    expect(await rows("SELECT 1 FROM core_notifications WHERE type_key = 'fundraising.campaign-target-reached'")).not.toHaveLength(0)
  })

  it('keeps the fund once a gift is received, and lists the campaign\'s gifts in the console', async () => {
    const moved = await req('PATCH', `/api/fundraising/campaigns/${campaignId}`, { ...fields(), fundId: general, offsetMinor: 1000, offsetNote: 'Raffle at the summer party' })
    expect(moved.body.code).toBe('fundraising.campaign.fund-fixed')
    const list = await req('GET', `/api/fundraising/donations?campaignId=${campaignId}`)
    expect(list.body.donations).toHaveLength(4)
    const all = await req('GET', '/api/fundraising/campaigns')
    expect(all.body.campaigns[0]).toMatchObject({ slug: 'mend-the-roof', state: 'open', raisedMinor: 53500, targetMinor: 50000 })
  })

  it('refuses a gift to a campaign that is closed', async () => {
    await req('PATCH', `/api/fundraising/campaigns/${campaignId}`, { step: 'close' })
    const refused = await req('POST', '/api/fundraising/give', { amountMinor: 1000, campaignId, email: 'late@example.org' }, visitor)
    expect(refused.body.code).toBe('fundraising.give.campaign-closed')
    expect((await req('GET', '/api/fundraising/give/options?campaign=mend-the-roof', undefined, visitor)).body.campaign.open).toBe(false)
    // The closed page points donors to its fund, which takes gifts though it is not offered generally.
    const options = await req('GET', `/api/fundraising/give/options?fund=${roof}`, undefined, visitor)
    expect(options.body.funds.map((f: { id: string }) => f.id)).toContain(roof)
    expect((await req('GET', '/api/fundraising/give/options', undefined, visitor)).body.funds.map((f: { id: string }) => f.id)).not.toContain(roof)
    const id = await give({ amountMinor: 1000, fundId: roof })
    expect((await rows<{ fund_id: string, campaign_id: string | null }>('SELECT fund_id, campaign_id FROM fundraising_donations WHERE id = ?', id))[0]).toEqual({ fund_id: roof, campaign_id: null })
  })
})
