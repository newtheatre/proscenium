import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { openView, skipReason, startApp } from '../helpers/webview'
import type { AppUnderTest } from '../helpers/webview'

const skip = skipReason()
// Booting the application is far past bun's five second default for a hook.
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest

beforeAll(async () => {
  if (skip) return
  app = await startApp()
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

describe.skipIf(skip !== null)('the application serves a page (0022)', () => {
  test('the home page renders its heading', async () => {
    const view = await openView()
    try {
      await view.navigate(app.baseURL)
      const heading = await view.evaluate<string>('document.querySelector("h1")?.textContent?.trim() ?? ""')
      expect(heading).toContain('Nottingham New Theatre')
    }
    finally { view.close() }
  })

  // The design language's contrast floor, checked where it actually matters: as the browser
  // resolves it, not as the stylesheet declares it (0021).
  test('the brand tokens resolve in the browser', async () => {
    const view = await openView()
    try {
      await view.navigate(app.baseURL)
      const tokens = await view.evaluate<Record<string, string>>(`(() => {
        const root = getComputedStyle(document.documentElement)
        return {
          primary: root.getPropertyValue('--ui-primary').trim(),
          purple600: root.getPropertyValue('--color-purple-600').trim(),
          font: getComputedStyle(document.body).fontFamily,
        }
      })()`)
      expect(tokens.purple600).not.toBe('')
      expect(tokens.primary).toBe(tokens.purple600!)
      expect(tokens.font).toContain('Figtree')
    }
    finally { view.close() }
  })

  test('the health endpoint answers', async () => {
    const response = await fetch(`${app.baseURL}/api/health`)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true })
  })
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
