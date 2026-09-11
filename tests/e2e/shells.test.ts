import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { adminSession } from '#tests/helpers/accounts'
import { testVenue } from '#tests/helpers/programme'
import { click, openView, skipReason, startApp, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest

// The programme pages are only themselves with a show on them, so the budget is counted on a
// real one rather than on an empty listing (J-111 criterion 9).
let showSlug = ''
let performanceId = ''

async function seedShow(cookie: string): Promise<void> {
  const database = new Database(app.databaseFile)
  let venueId: string
  try {
    venueId = testVenue(sqliteTarget(database), { suffix: crypto.randomUUID().slice(0, 8), capacity: 60 }).id
  }
  finally {
    database.close()
  }

  const send = (path: string, body: unknown): Promise<Response> =>
    fetch(`${app.baseURL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    })

  showSlug = `shells-${crypto.randomUUID().slice(0, 8)}`
  const show = await (await send('/api/admin/shows', { title: 'A Midsummer Night\'s Dream', slug: showSlug })).json() as { id: string }
  const startsAt = Math.floor(Date.now() / 1000) + 7 * 86_400
  const performance = await (await send(`/api/admin/shows/${show.id}/performances`, {
    venueId, startsAt, durationMinutes: 120, intervalCount: 1, intervalMinutes: 15,
  })).json() as { id: string }
  performanceId = performance.id
  await send(`/api/admin/shows/${show.id}/publish`, { published: true, cascadePerformances: true })
}

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  await seedShow((await adminSession(app)).cookie)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

async function inspect<T>(path: string, script: string): Promise<T> {
  const view = await openView()
  try {
    await view.navigate(`${app.baseURL}${path}`)
    return await view.evaluate<T>(script)
  }
  finally {
    view.close()
  }
}

const KIT_COUNTS = `(() => ({
  marquee: document.querySelectorAll('.nnt-marquee').length,
  sticker: document.querySelectorAll('.nnt-sticker').length,
  spotlight: document.querySelectorAll('.nnt-spotlight').length,
}))()`

describe.skipIf(skip !== null)('the three shells (docs/design-language.md)', () => {
  // Stage black in both colour modes, done by marking the subtree rather than overriding slot
  // classes: every token inside then resolves to its dark value on its own.
  test('the public chrome is stage black while the page is not', async () => {
    const seen = await inspect<{ subtree: string, root: string, header: string }>('/', `(() => {
      const wrapper = document.querySelector('.dark')
      const header = document.querySelector('header')
      return {
        subtree: getComputedStyle(wrapper).getPropertyValue('--ui-bg').trim(),
        root: getComputedStyle(document.documentElement).getPropertyValue('--ui-bg').trim(),
        header: getComputedStyle(header).backgroundColor,
      }
    })()`)
    expect(seen.subtree).toContain('oklch')
    expect(seen.header).toBe(seen.subtree)
    expect(seen.root).not.toBe(seen.subtree)
  })

  // At most one marquee CTA, one sticker and one spotlight per view. The budget is a rule and
  // not a suggestion, so it is a test rather than a habit.
  test('a public view spends its expressive budget at most once each', async () => {
    const paths = [
      '/', '/sign-in', '/register', '/verify', '/reset', '/magic', '/training/modules',
      '/whats-on', `/shows/${showSlug}`, `/book/${performanceId}`, '/about', '/policies/booking',
    ]
    for (const path of paths) {
      const counts = await inspect<Record<string, number>>(path, KIT_COUNTS)
      for (const [element, count] of Object.entries(counts)) {
        expect(`${path} ${element}: ${count <= 1}`).toBe(`${path} ${element}: true`)
      }
    }
  }, 150_000)

  // UHeader wraps the title slot in its own anchor, so a link inside it nests one anchor in
  // another and the page hydrates with a mismatch on every load (#895).
  test('the header title is one anchor deep', async () => {
    expect(await inspect<number>('/', `document.querySelectorAll('header a a').length`)).toBe(0)
  })

  // The toggle is a phone visitor's only navigation control, so the panel behind it has to carry
  // the links rather than open empty (#894).
  test('the mobile header panel carries the public links', async () => {
    const link = `[...document.querySelectorAll('[data-test=header-nav-mobile] a')].find(node => node.innerText.includes("What's on"))`
    const view = await openView({ width: 390, height: 780 })
    try {
      await visit(view, `${app.baseURL}/`)
      await click(view, 'header button')
      await waitFor(view, link)
      await view.evaluate(`${link}.click()`)
      await waitFor(view, `location.pathname === '/whats-on'`)
      expect(await view.evaluate<string>('location.pathname')).toBe('/whats-on')
    }
    finally {
      view.close()
    }
  })

  // No poster kit in the console. On /dev because it wears the console layout and holds no
  // middleware, so a signed-out view renders the shell rather than the sign-in screen (0040).
  test('the console shell uses none of the expressive kit', async () => {
    expect(await inspect<Record<string, number>>('/dev', KIT_COUNTS))
      .toEqual({ marquee: 0, sticker: 0, spotlight: 0 })
  })

  test('the show-night shell is a dark subtree, not a dashboard', async () => {
    const seen = await inspect<{ bg: string, dashboard: number }>('/tonight', `(() => ({
      bg: getComputedStyle(document.querySelector('.dark')).backgroundColor,
      dashboard: document.querySelectorAll('[class*="dashboard"]').length,
    }))()`)
    expect(seen.bg).toContain('oklch')
    expect(seen.dashboard).toBe(0)
  })

  // The Google route refuses with a code; the wording lives on the page that shows it, so an
  // unhandled code would leave a member staring at nothing.
  test('every refusal code the Google route can send is explained', async () => {
    for (const code of ['not-workspace', 'unverified-email', 'account', 'linked-elsewhere', 'google']) {
      const text = await inspect<string>(`/sign-in?refused=${code}`, 'document.body.innerText')
      expect(`${code}: ${text.length > 40 && !text.includes('undefined')}`).toBe(`${code}: true`)
    }
  })
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
