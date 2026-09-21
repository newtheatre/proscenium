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

// Get involved is written: its hero, its tiles and its steps are the page, and the home page and
// the error page both offer it. The other three are still the committee's to write.
const UNWRITTEN = PAGES.filter(page => page.path !== '/get-involved')

describe.skipIf(skip !== null)('editorial pages render from content markdown (D-103)', () => {
  for (const { path, title } of PAGES) {
    test(`${path} renders`, async () => {
      const response = await fetch(`${app.baseURL}${path}`)
      expect(response.status).toBe(200)
      expect(await response.text()).toContain(title)
    })
  }

  for (const { path } of UNWRITTEN) {
    test(`${path} states that it awaits committee copy`, async () => {
      expect(await (await fetch(`${app.baseURL}${path}`)).text()).toContain('Awaiting committee copy')
    })
  }

  test('a path with no matching content page is a 404, not a blank screen', async () => {
    const response = await fetch(`${app.baseURL}/no-such-editorial-page`)
    expect(response.status).toBe(404)
  })

  // D-103 criterion 6: neither end of the shell links a page awaiting copy. The pages stay
  // reachable by address, which is how an editor previews one.
  test('neither the header nor the footer links a page that still awaits committee copy', async () => {
    const html = await (await fetch(`${app.baseURL}/`)).text()
    const footer = html.slice(html.indexOf('data-test="footer-links"'))
    const header = html.slice(0, html.indexOf('data-test="footer-links"'))

    for (const { path } of UNWRITTEN) {
      expect(`footer ${path}: ${footer.includes(`href="${path}"`)}`).toBe(`footer ${path}: false`)
      expect(`header ${path}: ${header.includes(`href="${path}"`)}`).toBe(`header ${path}: false`)
    }

    // The written pages are still reached from both ends.
    expect(header).toContain('href="/get-involved"')
    expect(footer).toContain('href="/get-involved"')
    expect(footer).toContain('href="/policies/booking"')
    expect(footer).toContain('href="/whats-on"')
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

  // J-111: get-involved is a landing page rather than a reading column, and everything on it is
  // drawn from the content file rather than written into the Vue.
  test('get-involved lays out its departments and its steps, and holds its quote back', async () => {
    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/get-involved`, '[data-test="get-involved"]')
      const seen = await view.evaluate<string>(`JSON.stringify({
        departments: document.querySelectorAll('[data-test="department"]').length,
        steps: document.querySelectorAll('[data-test="step"]').length,
        quote: document.querySelectorAll('[data-test="join-quote"]').length,
        join: document.querySelectorAll('[data-test="join-action"]').length,
        placeholder: document.querySelectorAll('[data-test="placeholder-banner"]').length,
        marquee: document.querySelectorAll('.nnt-marquee').length,
        sticker: document.querySelectorAll('.nnt-sticker').length,
        spotlight: document.querySelectorAll('.nnt-spotlight').length,
      })`)
      const counts = JSON.parse(seen) as Record<string, number>

      expect(counts.departments).toBeGreaterThan(3)
      expect(counts.steps).toBe(3)
      // No quote in the front matter and so no band: nobody is quoted until somebody has said it
      // (D-103 criterion 6).
      expect(counts.quote).toBe(0)
      expect(counts.join).toBeGreaterThan(0)
      // The page's own furniture is written, so the page-level placeholder treatment is gone; its
      // prose sections still say what belongs under them (J-111 criterion 18).
      expect(counts.placeholder).toBe(0)
      for (const element of ['marquee', 'sticker', 'spotlight']) {
        expect(`${element}: ${counts[element]! <= 1}`).toBe(`${element}: true`)
      }
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  // D-103 criterion 6: the body is empty until the committee writes it, and an empty body is no
  // column, no heading and no gap rather than four headings over stand-in sentences.
  test('the landing page renders no prose column while its body is empty', async () => {
    const html = await (await fetch(`${app.baseURL}/get-involved`)).text()
    expect(html).not.toContain('data-test="content-body"')
    expect(html).not.toContain('Awaiting committee copy')
    for (const heading of ['Joining', 'On stage', 'Off stage']) {
      expect(`${heading}: ${html.includes(`>${heading}<`)}`).toBe(`${heading}: false`)
    }
  })

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
