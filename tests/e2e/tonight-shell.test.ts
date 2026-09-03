import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { NIGHT_TAP_TARGET_PX, NIGHT_VIEWPORT_PX, lastSyncedLabel } from '#shared/utils/night-shell'
import { click, openView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// K-102 in a real browser, at the size of the phone the story names. The hub is the one screen
// that exists; the door and the till inherit these rules by being built from the same primitives.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000
const PHONE = { width: NIGHT_VIEWPORT_PX, height: 740 }
let app: AppUnderTest

beforeAll(async () => {
  if (skip) return
  app = await startApp()
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

interface Box { top: number, bottom: number, width: number, height: number }

const BOX = (selector: string): string => `(() => {
  const rect = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect()
  return JSON.stringify({ top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height })
})()`

async function boxOf(view: Bun.WebView, selector: string): Promise<Box> {
  await waitFor(view, `document.querySelector(${JSON.stringify(selector)})`)
  return JSON.parse(await view.evaluate<string>(BOX(selector))) as Box
}

// An hour, so a label that did not move is a different label rather than a rounding of the same one.
const SKEW_MS = 60 * 60 * 1000

// The minute can turn between the page setting the time and the test reading it back, so both
// labels are acceptable and nothing else is.
function acceptableLabels(offsetMs: number): string[] {
  const now = Date.now() + offsetMs
  return [lastSyncedLabel(new Date(now)), lastSyncedLabel(new Date(now - 60_000))]
}

describe.skipIf(skip !== null)('the phone-first shell (K-102)', () => {
  // Criterion 1: laid out for 360 pixels first. A screen that overflows sideways at that width was
  // designed for a desk and squeezed.
  test('the hub fits a 360 pixel phone with no sideways scroll', async () => {
    const view = await openView(PHONE)
    try {
      await visit(view, `${app.baseURL}/tonight`)
      const seen = JSON.parse(await view.evaluate<string>(`JSON.stringify({
        width: window.innerWidth,
        wide: document.documentElement.scrollWidth,
        height: window.innerHeight,
        tall: document.documentElement.scrollHeight,
      })`)) as { width: number, wide: number, height: number, tall: number }
      expect(seen.width).toBe(NIGHT_VIEWPORT_PX)
      expect(seen.wide).toBeLessThanOrEqual(seen.width)
      // Nor downwards, on a screen holding nothing: a shell that overflows by its own padding
      // pushes the actions off the bottom before a page has put anything in it.
      expect(seen.tall).toBeLessThanOrEqual(seen.height)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  // Criterion 2: the primary action is at least 48 by 48, sits in the bottom third, and is on
  // screen without scrolling, because a thumb does not scroll to find the admit button.
  test('the primary action is thumb-sized and under the thumb', async () => {
    const view = await openView(PHONE)
    try {
      await visit(view, `${app.baseURL}/tonight`)
      // The window is not the viewport: the browser's own chrome takes a slice, and measuring the
      // action against the window instead would pass on one that had scrolled out of sight.
      const viewport = await view.evaluate<number>('window.innerHeight')
      const action = await boxOf(view, '[data-test="night-action"]')
      expect(action.height).toBeGreaterThanOrEqual(NIGHT_TAP_TARGET_PX)
      expect(action.width).toBeGreaterThanOrEqual(NIGHT_TAP_TARGET_PX)
      expect(action.top).toBeGreaterThanOrEqual(viewport * 2 / 3)
      expect(action.bottom).toBeLessThanOrEqual(viewport)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  // Criterion 3: stage black by default, with the shell marked dark rather than the page opting in.
  test('the shell is dark before any page asks for it', async () => {
    const view = await openView(PHONE)
    try {
      await visit(view, `${app.baseURL}/tonight`)
      const seen = JSON.parse(await view.evaluate<string>(`JSON.stringify({
        scheme: getComputedStyle(document.querySelector('.dark')).colorScheme,
        main: Boolean(document.querySelector('.dark main')),
      })`)) as { scheme: string, main: boolean }
      expect(seen.scheme).toBe('dark')
      expect(seen.main).toBe(true)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  // "Last synced HH:MM" in London time, whatever zone the browser or the worker is in.
  test('the stale label names the London minute it last synced, and the action refreshes it', async () => {
    const view = await openView(PHONE)
    try {
      await visit(view, `${app.baseURL}/tonight`)
      await waitFor(view, `/Last synced \\d\\d:\\d\\d/.test(document.querySelector('[data-test="night-stale"]')?.innerText ?? '')`)
      const before = await textOf(view, '[data-test="night-stale"]')
      expect(acceptableLabels(0)).toContain(before)

      // The page's clock is pushed an hour on before the press, so a press that changed nothing
      // leaves the old label and fails here rather than passing on a label that never moved.
      await view.evaluate(`(() => {
        const real = Date
        const ahead = ${SKEW_MS}
        window.Date = class extends real {
          constructor(...args) { super(...(args.length ? args : [real.now() + ahead])) }
          static now() { return real.now() + ahead }
        }
        return true
      })()`)
      await click(view, '[data-test="night-action"]')
      await waitFor(view, `document.querySelector('[data-test="night-stale"]').innerText !== ${JSON.stringify(before)}`)
      expect(acceptableLabels(SKEW_MS)).toContain(await textOf(view, '[data-test="night-stale"]'))
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
