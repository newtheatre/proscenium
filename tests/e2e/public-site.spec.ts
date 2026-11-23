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
const owner = person('acc_siteowner', 'Site Owner', ['core.settings.manage', 'core.modules.manage', 'core.vocabulary.manage', 'public-site.site.configure'])
const manager = person('acc_sitemanager', 'Site Manager', ['core.production.view', 'core.production.create', 'core.production.edit', 'core.production.publish', 'core.production.cancel', 'core.performance.schedule', 'core.performance.cancel', 'core.venue.manage', 'core.season.manage'])
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })
const stamp = Date.now() % 1_000_000
const title = `The Public Show ${stamp}`
let slug = ''
const pastTitle = `The Cancelled Show ${stamp}`
let pastSlug = ''
let venueSlug = ''
let seasonSlug = ''

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

  const api = await playwright.request.newContext({ ...base, ...as(manager) })
  const production = await post(api, '/api/core/productions', { title, kind: 'own' })
  await post(api, `/api/core/productions/${production.id}`, {
    summary: 'A play about a theatre that opens its doors.', categoryTermId: play.id, effectsConfirmedNone: true, advisoriesConfirmedNone: true,
    runningMinutes: 135, intervalCount: 1, externalBookingUrl: 'https://tickets.example/public-show',
    description: 'Our **first** show of the year.\n\n- A new play\n- Live music\n\n[Read the programme](https://example.org/programme)\n\n<script>window.typedScript = true</script>',
  }, 'patch')
  const venue = await post(api, '/api/core/venues', { name: `Public Theatre ${stamp}`, addressLines: '1 Theatre Street', locality: 'Nottingham', postcode: 'NG1 1AA', gettingHere: 'Ten minutes\' walk from the **station**.' })
  const placeAccess = async (slug: string) => (await (await settings.get('/api/core/vocabularies/core.place-access')).json()).terms.find((t: { slug: string }) => t.slug === slug).id as string
  expect((await api.put(`/api/core/venues/${venue.venueId}/access`, { data: { spaceId: null, features: [{ termId: await placeAccess('step-free'), note: 'From the front door' }, { termId: await placeAccess('hearing-loop'), note: null }] } })).ok()).toBe(true)
  venueSlug = (await (await api.get(`/api/core/venues/${venue.venueId}`)).json()).venue.slug
  const season = await post(api, '/api/core/seasons', { name: `Spring ${stamp}`, startsOn: '2031-01-01', endsOn: '2031-06-30' })
  await post(api, `/api/core/seasons/${season.id}/state`, { to: 'published' })
  await post(api, `/api/core/productions/${production.id}`, { seasonId: season.id }, 'patch')
  seasonSlug = ((await (await api.get('/api/core/seasons?size=100')).json()).rows as { id: string, slug: string }[]).find(x => x.id === season.id)!.slug
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

  // A cancelled production is past at once, so it is in the archive with no waiting.
  const past = await post(api, '/api/core/productions', { title: pastTitle, kind: 'visiting' })
  await post(api, `/api/core/productions/${past.id}`, { summary: 'A visiting show.', categoryTermId: play.id, effectsConfirmedNone: true, advisoriesConfirmedNone: true, companyName: `Lantern Company ${stamp}` }, 'patch')
  const pastDate = await post(api, `/api/core/productions/${past.id}/performances`, { venueId: venue.venueId, spaceId: venue.spaceId, startsAt: at(2) })
  await post(api, `/api/core/performances/${pastDate.id}/schedule`, {})
  await post(api, `/api/core/productions/${past.id}/publish`, {})
  await post(api, `/api/core/productions/${past.id}/cancel`, { reasonTermId: reason.id })
  pastSlug = (await (await api.get(`/api/core/productions/${past.id}`)).json()).production.slug
  await api.dispose()
  await settings.dispose()
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

test('what\'s on bills the soonest show at the top with its next dates, and not while filtered', async ({ page }) => {
  await visit(page, '/whats-on')
  const spotlight = page.locator('section[aria-labelledby="spotlight-title"]')
  await expect(spotlight).toHaveCount(1)
  const show = await spotlight.getByRole('heading', { level: 2 }).getByRole('link').getAttribute('href')
  expect(show).toMatch(/^\/whats-on\//)
  await expect(spotlight.getByRole('link', { name: 'Book tickets' })).toHaveAttribute('href', `${show}#dates`)
  await expect(spotlight.getByRole('link', { name: 'About the show' })).toHaveAttribute('href', show!)
  await expect(page.getByRole('heading', { level: 3 }).filter({ hasText: /\d{4}$/ }).first()).toBeVisible()
  await visit(page, '/whats-on?month=2031-03')
  await expect(spotlight).toHaveCount(0)
})

test('what\'s on filters from one toolbar over the list, and a chip takes a filter off', async ({ page }) => {
  await visit(page, '/whats-on?month=2031-03')
  const toolbar = page.getByRole('search', { name: 'Filter what\'s on' })
  await expect(page.getByRole('heading', { name: /^Coming up/, level: 2 })).toBeVisible()
  await expect(toolbar.getByLabel('Month')).toHaveValue('2031-03')
  await expect(toolbar.getByRole('button', { name: 'Show' })).toBeHidden()
  await toolbar.getByLabel('Month').selectOption('')
  await expect(page).toHaveURL(/\/whats-on$/)
  await visit(page, '/whats-on?month=2031-03')
  await page.getByRole('link', { name: /^Remove filter: / }).click()
  await expect(page).toHaveURL(/\/whats-on$/)
  await expect(page.getByRole('link', { name: new RegExp(title) })).toHaveCount(1)
})

test('on a phone the filters open in a sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await visit(page, '/whats-on?month=2031-03')
  await expect(page.getByRole('search', { name: 'Filter what\'s on' })).toBeHidden()
  await page.getByRole('button', { name: /^Filter/ }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByLabel('Month')).toHaveValue('2031-03')
  await noViolations(page)
  await sheet.getByLabel('Month').selectOption('')
  await expect(page).toHaveURL(/\/whats-on$/)
  await sheet.getByRole('button', { name: /^Show \d+ shows?$/ }).click()
  await expect(sheet).toBeHidden()
})

test('what\'s on narrows by month and venue, and says when nothing matches', async ({ page }) => {
  await visit(page, '/whats-on?month=2031-03')
  await expect(page.getByRole('link', { name: new RegExp(title) })).toHaveAttribute('href', `/whats-on/${slug}`)
  await visit(page, '/whats-on?month=2031-03&venue=no-such-venue-here')
  await expect(page.getByRole('heading', { name: 'Nothing on matches' })).toBeVisible()
  await noViolations(page)
  await page.getByRole('link', { name: 'Clear the filters' }).click()
  await expect(page).toHaveURL(/\/whats-on$/)
  await expect(page.getByRole('link', { name: new RegExp(title) })).toHaveCount(1)
})

test('the home page lists what is on through ::whats-on', async ({ page }) => {
  await visit(page, '/')
  await expect(page.getByRole('heading', { name: 'What\'s on', level: 2 })).toBeVisible()
  await expect(page.locator('a[href^="/whats-on/"]').first()).toBeAttached()
  await noViolations(page)
})

test('the header leads to what is on and to past shows', async ({ page }) => {
  await visit(page, '/')
  const header = page.getByRole('banner')
  await expect(header.getByRole('link', { name: 'What\'s on' }).first()).toHaveAttribute('href', '/whats-on')
  await expect(header.getByRole('link', { name: 'Past shows' }).first()).toHaveAttribute('href', '/shows')
})

test('the sitemap lists the shows, the venue and the season but not a starter page; robots.txt points to it once search engines are let in', async ({ playwright, request }) => {
  const settings = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(owner) })
  expect((await settings.put('/api/core/settings', { data: { changes: [{ key: 'public-site.search.hidden', value: false }], confirm: true } })).ok()).toBe(true)
  await settings.dispose()
  const sitemap = await request.get('/sitemap.xml')
  expect(sitemap.status()).toBe(200)
  expect(sitemap.headers()['content-type']).toContain('application/xml')
  const xml = await sitemap.text()
  for (const path of ['/whats-on', '/shows', `/whats-on/${slug}`, `/shows/${pastSlug}`, `/venues/${venueSlug}`, `/seasons/${seasonSlug}`])
    expect(xml).toContain(`<loc>http://localhost:8788${path}</loc>`)
  // The starter home page is still marked placeholder, so it is kept from search engines.
  expect(xml).not.toContain('<loc>http://localhost:8788/</loc>')
  const robots = await (await request.get('/robots.txt')).text()
  expect(robots).toContain('Disallow: /console')
  expect(robots).toContain('Sitemap: http://localhost:8788/sitemap.xml')
})

test('what\'s on works with scripts off', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto('/whats-on')
  await expect(page.getByRole('link', { name: new RegExp(title) })).toHaveAttribute('href', `/whats-on/${slug}`)
  // The filters are a GET form whose Show button appears only without scripts.
  await page.goto('/whats-on?venue=no-such-venue-here&month=2031-03')
  const toolbar = page.getByRole('search', { name: 'Filter what\'s on' })
  await toolbar.getByLabel('Venue').selectOption('')
  await toolbar.getByRole('button', { name: 'Show' }).click()
  await expect(page).toHaveURL(/month=2031-03/)
  await expect(page.getByRole('link', { name: new RegExp(title) })).toHaveAttribute('href', `/whats-on/${slug}`)
  await context.close()
})

test('the production page shows its dates, the booking link, the cancelled date and its event data', async ({ page }) => {
  await visit(page, `/whats-on/${slug}`)
  await expect(page.getByText(`Spring ${stamp} · Play`, { exact: true })).toBeVisible()
  await expect(page.getByText(/2 hours 15 minutes, with an interval/)).toBeVisible()
  // The top states the facts somebody decides on, each under its own label.
  const top = page.getByRole('region', { name: title })
  await expect(top.getByRole('heading', { level: 1, name: title })).toBeVisible()
  await expect(top.getByText('Running time', { exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: 'A red stage curtain' })).toBeVisible()
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/files\//)
  await expect(page.getByText('This production has no staging effects or content warnings.')).toBeVisible()
  const dates = page.getByRole('region', { name: 'Dates and tickets' })
  // The theatre's own outside link says it leaves the site.
  const book = dates.getByRole('link', { name: /^Book elsewhere for .+\(opens in a new tab\)$/ })
  await expect(book).toHaveCount(1)
  await expect(book).toHaveAttribute('href', 'https://tickets.example/public-show')
  await expect(dates.getByText('Captioned')).toBeVisible()
  await expect(dates.locator('.line-through')).toHaveCount(1)
  await expect(dates.getByText('Cancelled', { exact: true })).toBeVisible()
  // The venue's name links to its page, and Getting here gives its address and access in brief.
  const gettingHere = page.getByRole('region', { name: 'Getting here' })
  await expect(gettingHere.getByText('1 Theatre Street, Nottingham NG1 1AA')).toBeVisible()
  await expect(gettingHere.getByText('Step-free access')).toBeVisible()
  await expect(page.getByRole('link', { name: `Public Theatre ${stamp}`, exact: true }).first()).toHaveAttribute('href', `/venues/${venueSlug}`)

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

test('the archive finds a past show by its company and opens it under /shows', async ({ page }) => {
  await visit(page, '/shows')
  await expect(page.getByRole('heading', { name: 'Past shows', level: 1 })).toBeVisible()
  await page.getByLabel('Find a show, company or person').fill(`Lantern Company ${stamp}`)
  await page.getByRole('button', { name: 'Search' }).click()
  await expect(page).toHaveURL(/\/shows\?q=/)
  await expect(page.getByRole('heading', { name: /^1 show found for/ })).toBeVisible()
  await expect(page.getByRole('link', { name: new RegExp(pastTitle) })).toHaveAttribute('href', `/shows/${pastSlug}`)
  await expect(page.getByText('Cancelled', { exact: true })).toBeVisible()
  // The pointer is still over Search; its hover shade is not what a reader sees at rest.
  await page.mouse.move(0, 0)
  await noViolations(page)
  await page.screenshot({ path: 'test-results/public-archive-light.png', fullPage: true })
  await page.emulateMedia({ colorScheme: 'dark' })
  await noViolations(page)
  await page.emulateMedia({ colorScheme: 'light' })
  await page.getByText(pastTitle).click({ force: true })
  await expect(page).toHaveURL(new RegExp(`/shows/${pastSlug}$`))
  await expect(page.getByRole('heading', { name: pastTitle, level: 1 })).toBeVisible()

  // Its old address under /whats-on goes to /shows, temporarily.
  const redirect = await page.request.get(`/whats-on/${pastSlug}`, { maxRedirects: 0 })
  expect(redirect.status()).toBe(302)
  expect(redirect.headers().location).toMatch(new RegExp(`/shows/${pastSlug}$`))
})

test('the archive search works with scripts off', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto('/shows')
  await page.getByLabel('Find a show, company or person').fill(pastTitle)
  await page.getByRole('button', { name: 'Search' }).click()
  await expect(page.getByRole('link', { name: new RegExp(pastTitle) })).toHaveAttribute('href', `/shows/${pastSlug}`)
  await context.close()
})

test('a venue\'s page shows its address, getting here, access with labels, and what is on there', async ({ page }) => {
  await visit(page, `/venues/${venueSlug}`)
  await expect(page.getByRole('heading', { name: `Public Theatre ${stamp}`, level: 1 })).toBeVisible()
  await expect(page.locator('address')).toContainText('1 Theatre Street')
  await expect(page.getByRole('link', { name: /Open in a map/ })).toHaveAttribute('href', /openstreetmap\.org\/search\?query=/)
  const gettingHere = page.getByRole('region', { name: 'Getting here' })
  await expect(gettingHere.locator('strong')).toHaveText('station')
  const access = page.getByRole('region', { name: 'Access' })
  await expect(access.getByText('Step-free access')).toBeVisible()
  await expect(access.getByText(': From the front door')).toBeVisible()
  await expect(access.getByText('Hearing loop')).toBeVisible()
  await expect(page.getByRole('region', { name: "What's on here" }).getByRole('link', { name: new RegExp(title) })).toHaveAttribute('href', `/whats-on/${slug}`)
  await noViolations(page)
  await page.emulateMedia({ colorScheme: 'dark' })
  await noViolations(page)
})

test('the venues index lists each venue with its address and access, opening its page', async ({ page }) => {
  await visit(page, '/venues')
  await expect(page.getByRole('heading', { name: 'Venues', level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: new RegExp(`Public Theatre ${stamp}`) })).toHaveAttribute('href', `/venues/${venueSlug}`)
  await noViolations(page)
})

test('a season\'s page lists its productions', async ({ page }) => {
  expect(seasonSlug).not.toBe('')
  await visit(page, `/seasons/${seasonSlug}`)
  await expect(page.getByRole('heading', { name: `Spring ${stamp}`, level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: new RegExp(title) })).toHaveAttribute('href', `/whats-on/${slug}`)
  await noViolations(page)
  expect((await page.request.get('/seasons/no-such-season-here')).status()).toBe(404)
})
