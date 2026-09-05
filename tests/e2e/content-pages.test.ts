import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { skipReason, startApp } from '#tests/helpers/webview'
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
