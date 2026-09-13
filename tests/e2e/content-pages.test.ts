import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { openSignedOutView, skipReason, startApp, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// D-103: the four editorial pages are Nuxt Content markdown rendered through one catch-all
// route, and an unknown path still 404s rather than rendering a blank screen.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest

beforeAll(async () => {
  if (skip) return
  app = await startApp()
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const PAGES = [
  { path: '/about', title: 'About us' },
  { path: '/history', title: 'Our history' },
  { path: '/get-involved', title: 'Get involved' },
  { path: '/technical-specification', title: 'Technical specification' },
]

describe.skipIf(skip !== null)('editorial pages render from content markdown (D-103)', () => {
  for (const { path, title } of PAGES) {
    test(`${path} renders and states it awaits committee copy`, async () => {
      const response = await fetch(`${app.baseURL}${path}`)
      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain(title)
      expect(html).toContain('Awaiting committee copy')
    })
  }

  test('a path with no matching content page is a 404, not a blank screen', async () => {
    const response = await fetch(`${app.baseURL}/no-such-editorial-page`)
    expect(response.status).toBe(404)
  })

  test('the public nav links to all four pages', async () => {
    const html = await (await fetch(`${app.baseURL}/`)).text()
    for (const { path } of PAGES) {
      expect(html).toContain(`href="${path}"`)
    }
  })
})

// Issue 920: the editorial and policy pages set body copy at the container's full width, and a
// page with no banner fell back to a plain black band with nothing of the house in it.
describe.skipIf(skip !== null)('an editorial page reads as a column, not as a wall (J-111)', () => {
  const CASE_TIMEOUT_MS = 120_000

  // Roughly 75 characters at the body size. Well above a comfortable measure and well below the
  // 1200px container, so this catches a column that is not there rather than tuning one that is.
  const MEASURE_CEILING = 820

  test('the prose column is narrower than the container it sits in', async () => {
    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/about`, '[data-test="content-body"]')
      const seen = await view.evaluate<string>(`JSON.stringify((() => {
        const body = document.querySelector('[data-test="content-body"]')
        const paragraph = body.querySelector('p')
        return { prose: paragraph.getBoundingClientRect().width, viewport: window.innerWidth }
      })())`)
      const { prose, viewport } = JSON.parse(seen) as { prose: number, viewport: number }
      expect(viewport).toBeGreaterThan(1000)
      expect(prose).toBeLessThanOrEqual(MEASURE_CEILING)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('a page with no banner still opens on something of the house', async () => {
    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/policies/booking`, '[data-test="content-body"]')
      await waitFor(view, `document.querySelector('[data-test="content-hero"]') !== null`)
      const seen = await view.evaluate<string>(`JSON.stringify((() => {
        const hero = document.querySelector('[data-test="content-hero"]')
        return {
          spotlight: hero.classList.contains('nnt-spotlight') || hero.querySelector('.nnt-spotlight') !== null,
          headline: hero.querySelector('.nnt-headline') !== null,
        }
      })())`)
      expect(JSON.parse(seen)).toEqual({ spotlight: true, headline: true })
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('a long policy page carries a table of contents', async () => {
    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/policies/booking`, '[data-test="content-body"]')
      await waitFor(view, `document.querySelector('[data-test="content-toc"]') !== null`)
      const links = await view.evaluate<number>(`document.querySelectorAll('[data-test="content-toc"] a').length`)
      expect(links).toBeGreaterThan(1)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})
