// The public what's on and production pages in a real browser (C-38, C-39, C-46): a published
// production with two dates, one cancelled, is listed on /whats-on (with scripts off too); its page
// shows the dates with the booking action from its external link, the cancelled one struck through,
// and the event data search engines read; /shows sends a current show to /whats-on; and neither page
// has accessibility violations in light or dark.
import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { png } from './images'

const grant = (ability: string) => ({ ability, via: 'test' })
const person = (accountId: string, name: string, abilities: string[]) => ({ kind: 'person', accountId, name, assurance: 'strong', reassertedAt: Date.now(), grants: abilities.map(grant) })
const owner = person('acc_siteowner', 'Site Owner', ['core.settings.manage', 'core.modules.manage', 'core.vocabulary.manage'])
const manager = person('acc_sitemanager', 'Site Manager', ['core.production.view', 'core.production.create', 'core.production.edit', 'core.production.publish', 'core.performance.schedule', 'core.performance.cancel', 'core.venue.manage'])
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })
const stamp = Date.now() % 1_000_000
const title = `The Public Show ${stamp}`
let slug = ''

async function post(api: APIRequestContext, path: string, data: unknown, method: 'post' | 'patch' = 'post') {
  const response = await api[method](path, { data, headers: { 'idempotency-key': crypto.randomUUID() } })
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true)
  return response.json()
}

test.beforeAll(async ({ playwright }) => {
  const base = { baseURL: 'http://localhost:8788' }
  const settings = await playwright.request.newContext({ ...base, ...as(owner) })
  const set = async (changes: { key: string, value: unknown }[]) => {
    const response = await settings.put('/api/core/settings', { data: { changes, confirm: true } })
    expect(response.ok(), await response.text()).toBe(true)
  }
  await set([{ key: 'core.rate-limits.default', value: { count: 10000, per: '1m' } }, { key: 'core.rate-limits.write', value: { count: 10000, per: '1m' } }])
  await set([{ key: 'core.locale.time-zone', value: 'Europe/London' }])
  expect((await settings.put('/api/core/modules/public-site', { data: { on: true } })).ok()).toBe(true)
  const vocabularies = async (key: string) => (await (await settings.get(`/api/core/vocabularies/${key}`)).json()).terms as { id: string, slug: string }[]
  const play = (await vocabularies('core.production-category')).find(term => term.slug === 'play')!
  const reason = (await vocabularies('core.cancel-reason'))[0]!
  const captioned = (await vocabularies('core.access-feature')).find(term => term.slug === 'captioned')!
  await settings.dispose()

  const api = await playwright.request.newContext({ ...base, ...as(manager) })
  const production = await post(api, '/api/core/productions', { title, kind: 'own' })
  await post(api, `/api/core/productions/${production.id}`, {
    summary: 'A play about a theatre that opens its doors.', categoryTermId: play.id, advisoriesConfirmedNone: true,
    runningMinutes: 135, intervalCount: 1, externalBookingUrl: 'https://tickets.example/public-show',
    description: 'Our **first** show of the year.\n\n- A new play\n- Live music\n\n[Read the programme](https://example.org/programme)\n\n<script>window.typedScript = true</script>',
  }, 'patch')
  const venue = await post(api, '/api/core/venues', { name: `Public Theatre ${stamp}` })
  const at = (days: number) => Date.UTC(2031, 2, 10 + days, 19, 30)
  const kept = await post(api, `/api/core/productions/${production.id}/performances`, { venueId: venue.venueId, spaceId: venue.spaceId, startsAt: at(0) })
  await post(api, `/api/core/performances/${kept.id}/schedule`, {})
  expect((await api.put(`/api/core/performances/${kept.id}/access`, { data: { features: [{ termId: captioned.id, detail: null }] } })).ok()).toBe(true)
  const dropped = await post(api, `/api/core/productions/${production.id}/performances`, { venueId: venue.venueId, spaceId: venue.spaceId, startsAt: at(1) })
  await post(api, `/api/core/performances/${dropped.id}/schedule`, {})
  await post(api, `/api/core/performances/${dropped.id}/cancel`, { reasonTermId: reason.id })
  // A poster, checked in the background, then described and used.
  const upload = await api.post(`/api/core/files?slot=core.production-poster&owner=${production.id}&name=poster.png`, { data: png(60, 90, [150, 40, 60]), headers: { 'content-type': 'image/png' } })
  expect(upload.ok(), await upload.text()).toBe(true)
  const fileId = (await upload.json()).id as string
  await expect.poll(async () => (await (await api.get(`/api/core/productions/${production.id}/media`)).json()).waiting[0]?.state, { timeout: 15_000 }).toBe('ready')
  await post(api, `/api/core/files/${fileId}`, { altText: 'A red stage curtain' }, 'patch')
  await post(api, `/api/core/productions/${production.id}/media`, { fileId })
  await post(api, `/api/core/productions/${production.id}/publish`, {})
  slug = (await (await api.get(`/api/core/productions/${production.id}`)).json()).production.slug
  await api.dispose()
})

async function visit(page: Page, url: string) {
  const response = await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
  return response
}
async function noViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

test('what\'s on lists the production and opens its page', async ({ page }) => {
  await visit(page, '/whats-on')
  await expect(page.getByRole('heading', { name: 'What\'s on', level: 1 })).toBeVisible()
  // The whole card is the link, drawn over it, so a press anywhere on the card opens the page.
  await expect(page.getByRole('link', { name: new RegExp(title) })).toHaveAttribute('href', `/whats-on/${slug}`)
  await noViolations(page)
  await page.emulateMedia({ colorScheme: 'dark' })
  await noViolations(page)
  await page.emulateMedia({ colorScheme: 'light' })
  await page.getByText(title).click({ force: true })
  await expect(page).toHaveURL(new RegExp(`/whats-on/${slug}$`))
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()
})

test('what\'s on works with scripts off', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto('/whats-on')
  await expect(page.getByRole('link', { name: new RegExp(title) })).toHaveAttribute('href', `/whats-on/${slug}`)
  await context.close()
})

test('the production page shows its dates, the booking link, the cancelled date and its event data', async ({ page }) => {
  await visit(page, `/whats-on/${slug}`)
  await expect(page.getByText('Play', { exact: true })).toBeVisible()
  await expect(page.getByText(/2 hours 15 minutes, with an interval/)).toBeVisible()
  await expect(page.getByRole('img', { name: 'A red stage curtain' })).toBeVisible()
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/files\//)
  await expect(page.getByText('This production has no content advisories.')).toBeVisible()
  const dates = page.getByRole('region', { name: 'Dates' })
  const book = dates.getByRole('link', { name: /^Book for / })
  await expect(book).toHaveCount(1)
  await expect(book).toHaveAttribute('href', 'https://tickets.example/public-show')
  await expect(dates.getByText('Captioned')).toBeVisible()
  await expect(dates.locator('.line-through')).toHaveCount(1)
  await expect(dates.getByText('Cancelled', { exact: true })).toBeVisible()

  // The description's Markdown is drawn, and what looks like HTML stays text.
  const about = page.getByRole('region', { name: 'About the production' })
  await expect(about.locator('strong')).toHaveText('first')
  await expect(about.getByRole('listitem')).toHaveText(['A new play', 'Live music'])
  await expect(about.getByRole('link', { name: 'Read the programme' })).toHaveAttribute('href', 'https://example.org/programme')
  await expect(about.getByText('<script>window.typedScript = true</script>')).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { typedScript?: boolean }).typedScript)).toBeUndefined()

  const events = JSON.parse(await page.locator('script[type="application/ld+json"]').first().textContent() ?? '[]') as { '@type': string, 'name': string, 'eventStatus': string }[]
  expect(events.map(e => [e['@type'], e.name, e.eventStatus.split('/').pop()])).toEqual([['TheaterEvent', title, 'EventScheduled'], ['TheaterEvent', title, 'EventCancelled']])
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', title)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`/whats-on/${slug}$`))

  await noViolations(page)
  await page.screenshot({ path: 'test-results/public-production-light.png', fullPage: true })
  await page.emulateMedia({ colorScheme: 'dark' })
  await noViolations(page)
  await page.screenshot({ path: 'test-results/public-production-dark.png', fullPage: true })
})

test('a current show under /shows goes to /whats-on, and an unknown one is not found', async ({ page }) => {
  // Temporary, because the show moves to /shows when it closes (C-46).
  const redirect = await page.request.get(`/shows/${slug}`, { maxRedirects: 0 })
  expect(redirect.status()).toBe(302)
  expect(redirect.headers().location).toMatch(new RegExp(`/whats-on/${slug}$`))
  await visit(page, `/shows/${slug}`)
  await expect(page).toHaveURL(new RegExp(`/whats-on/${slug}$`))
  const response = await page.goto('/whats-on/no-such-show-at-all')
  expect(response?.status()).toBe(404)
})
