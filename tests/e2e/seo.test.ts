import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { adminSession } from '#tests/helpers/accounts'
import { testVenue } from '#tests/helpers/programme'
import { skipReason, startApp } from '#tests/helpers/webview'
import { OLD_SITE_REDIRECTS } from '#shared/utils/redirects'
import { ROBOTS_DISALLOW, SITE_NAME } from '#shared/utils/seo'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// K-125 against the live routes: what a crawler is told, what a shared link carries, and where
// an old address lands. The lists themselves are pinned in tests/unit/seo.test.ts.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
// A cold route compiles on first request, and several of these cases open a handful each.
const CASE_TIMEOUT_MS = 120_000

let app: AppUnderTest
let officer: TestMember
let venueId: string
let slug: string

const send = (method: string, path: string, body?: unknown): Promise<Response> =>
  fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'cookie': officer.cookie },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
  })

const html = async (path: string): Promise<string> => await (await fetch(`${app.baseURL}${path}`)).text()

const nextWeek = (): number => Math.floor(Date.now() / 1000) + 7 * 86_400

// A published show with one priced performance a week out, through the real admin routes.
async function publishedShow(): Promise<string> {
  const title = `The Seagull ${crypto.randomUUID().slice(0, 8)}`
  const created = slugOf(title)
  expect((await send('POST', '/api/admin/ticket-types', { name: `Standard ${created}`, price: 900 })).status).toBe(200)
  const show = await send('POST', '/api/admin/shows', { title, slug: created, description: 'Chekhov, by the lake.' })
  expect(show.status).toBe(200)
  const id = (await show.json() as { id: string }).id
  expect((await send('POST', `/api/admin/shows/${id}/performances`, {
    venueId, startsAt: nextWeek(), durationMinutes: 120, intervalCount: 1, intervalMinutes: 15,
  })).status).toBe(200)
  expect((await send('POST', `/api/admin/shows/${id}/publish`, { published: true, cascadePerformances: true })).status).toBe(200)
  return created
}

const slugOf = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, '-')

interface Node { '@type': string | string[], [key: string]: unknown }
interface Offer { price: string, priceCurrency: string, availability: string }

// Every node in the page's one JSON-LD graph, whichever way it declares its type.
function graph(page: string): Node[] {
  const match = page.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)
  expect(match).not.toBeNull()
  const parsed = JSON.parse(match![1]!) as { '@graph': Node[] }
  return parsed['@graph']
}

const typed = (node: Node, type: string): boolean => (Array.isArray(node['@type']) ? node['@type'] : [node['@type']]).includes(type)

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = await adminSession(app)
  const database = new Database(app.databaseFile)
  try {
    venueId = testVenue(sqliteTarget(database), { suffix: crypto.randomUUID().slice(0, 8), capacity: 40 }).id
  }
  finally {
    database.close()
  }
  // Before anything reads the sitemap, which the module caches once built.
  slug = await publishedShow()
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

describe.skipIf(skip !== null)('titles, descriptions and canonicals (K-125 criterion 1)', () => {
  test('a page title takes the house name after it, and the home page does not', async () => {
    expect(await html('/about')).toContain(`<title>About us | ${SITE_NAME}</title>`)
    expect(await html('/')).toContain('<title>The Nottingham New Theatre</title>')
  }, CASE_TIMEOUT_MS)

  test('a public page carries a description and an absolute canonical', async () => {
    const page = await html('/about')
    expect(page).toMatch(/<meta name="description" content="[^"]+"/)
    expect(page).toMatch(/<link rel="canonical" href="https?:\/\/[^"]+\/about"/)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('what a crawler is told (K-125 criteria 2 and 6)', () => {
  test('/robots.txt disallows every closed prefix and names the sitemap', async () => {
    const robots = await (await fetch(`${app.baseURL}/robots.txt`)).text()
    for (const pattern of ROBOTS_DISALLOW) expect(robots).toContain(`Disallow: ${pattern}`)
    expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/)
    expect(robots).not.toMatch(/^Disallow: \/$/m)
  }, CASE_TIMEOUT_MS)

  test('/sitemap.xml lists the public pages, the show and the catalogue, and no closed route', async () => {
    const sitemap = await (await fetch(`${app.baseURL}/sitemap.xml`)).text()
    // Anchored to the host, so /policies/rooms is not mistaken for /rooms.
    const listed = (path: string, beneath = false): RegExp =>
      new RegExp(`<loc>https?:\\/\\/[^/<]+${path.replace(/\//g, '\\/')}${beneath ? '(\\/[^<]*)?' : ''}<\\/loc>`)
    for (const path of ['/', '/whats-on', '/policies/booking', '/policies/rooms', '/training/modules', `/shows/${slug}`]) {
      expect(sitemap).toMatch(listed(path))
    }
    // A placeholder page is not offered, and nothing behind an account is.
    for (const path of ['/about', '/history', '/admin', '/account', '/sign-in', '/docs', '/tonight', '/rooms']) {
      expect(sitemap).not.toMatch(listed(path, true))
    }
  }, CASE_TIMEOUT_MS)

  test('the auth and utility pages are noindex and the home page is not', async () => {
    // Criterion 6's list; the rule that makes them noindex is the disallow list itself.
    for (const path of ['/sign-in', '/register', '/reset', '/verify', '/magic', '/qr', '/board']) {
      expect(await html(path)).toMatch(/<meta name="robots" content="noindex/)
    }
    expect(await html('/')).toMatch(/<meta name="robots" content="index/)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('the Open Graph image (K-125 criterion 3)', () => {
  test('the home page and a show without a poster share the house image', async () => {
    expect(await html('/')).toMatch(/<meta property="og:image" content="[^"]*\/og-default\.png"/)
    expect(await html(`/shows/${slug}`)).toMatch(/<meta property="og:image" content="[^"]*\/og-default\.png"/)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('structured data (K-125 criterion 4)', () => {
  test('the home page names the organisation as a theatre', async () => {
    const theatre = graph(await html('/')).find(node => typed(node, 'PerformingArtsTheater'))
    expect(theatre?.name).toBe(SITE_NAME)
  }, CASE_TIMEOUT_MS)

  test('a show page carries a TheaterEvent per performance with an offer per price', async () => {
    const events = graph(await html(`/shows/${slug}`)).filter(node => typed(node, 'TheaterEvent'))
    expect(events).toHaveLength(1)
    // One relation resolves to an object, several to an array; either way it is the offer per price.
    const related = events[0]!.offers as Offer | Offer[]
    const offers = Array.isArray(related) ? related : [related]
    expect(offers.length).toBeGreaterThan(0)
    expect(offers[0]).toMatchObject({ price: '9.00', priceCurrency: 'GBP' })
    expect(String(offers[0]!.availability)).toContain('InStock')
  }, CASE_TIMEOUT_MS)

  test('an editorial page carries breadcrumbs from home', async () => {
    const crumbs = graph(await html('/about')).find(node => typed(node, 'BreadcrumbList'))
    const items = crumbs?.itemListElement as { name: string }[]
    expect(items.map(item => item.name)).toEqual(['Home', 'About us'])
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('every old-site address answers 301 (K-125 criterion 5)', () => {
  const sample = (path: string): string => path.replace(/\/\*\*$/, '/sample')
  const resolve = (target: string): string => new URL(target, app.baseURL).href

  for (const [from, to] of Object.entries(OLD_SITE_REDIRECTS)) {
    test(`${from} lands on ${to}`, async () => {
      const response = await fetch(`${app.baseURL}${sample(from)}`, { redirect: 'manual' })
      expect(response.status).toBe(301)
      const expected = to.endsWith('/**') ? `${to.slice(0, -3)}/sample` : to
      expect(resolve(response.headers.get('location') ?? '')).toBe(resolve(expected))
    })
  }

  test('an old show address lands on the show, its booking form too, and a receipt on retrieval', async () => {
    for (const [from, to] of [
      [`/whats-on/${slug}`, `/shows/${slug}`],
      [`/whats-on/${slug}/book`, `/shows/${slug}`],
      [`/whats-on/${slug}/booking/abc123`, '/qr'],
    ]) {
      const response = await fetch(`${app.baseURL}${from}`, { redirect: 'manual' })
      expect(response.status).toBe(301)
      expect(resolve(response.headers.get('location') ?? '')).toBe(resolve(to!))
    }
  }, CASE_TIMEOUT_MS)

  test('a wildcard row answers its bare path too', async () => {
    const response = await fetch(`${app.baseURL}/mailing-list`, { redirect: 'manual' })
    expect(response.status).toBe(301)
    expect(resolve(response.headers.get('location') ?? '')).toBe(resolve(OLD_SITE_REDIRECTS['/mailing-list/**']!))
  })

  test('the what\'s-on listing itself is untouched', async () => {
    const response = await fetch(`${app.baseURL}/whats-on`, { redirect: 'manual' })
    expect(response.status).toBe(200)
  })
})
