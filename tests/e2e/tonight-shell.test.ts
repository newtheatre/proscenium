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

  // Criterion 2 on a screen that still owns a sticky action: at least 48 by 48, in the bottom
  // third, and on screen without scrolling, because a thumb does not scroll to find it.
  test('a sticky primary action is thumb-sized and under the thumb', async () => {
    const view = await openView(PHONE)
    try {
      await visit(view, `${app.baseURL}/tonight/glance`)
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

  // The hub spends its whole screen on the night's destinations rather than a sticky slot, so the
  // target floor governs there: every tile is a tap target in its own right (E-112 criterion 1).
  test('every tile on the hub is a thumb-sized target', async () => {
    const view = await openView(PHONE)
    try {
      await visit(view, `${app.baseURL}/tonight`)
      for (const selector of ['[data-test="tile-door"]', '[data-test="tile-glance"]', '[data-test="tile-backstage"]', '[data-test="tile-emergency"]', '[data-test="tile-contacts"]', '[data-test="tile-checklist"]', '[data-test="tile-report"]', '[data-test="tile-age-checks"]']) {
        const tile = await boxOf(view, selector)
        expect(`${selector}: ${tile.height >= NIGHT_TAP_TARGET_PX && tile.width >= NIGHT_TAP_TARGET_PX}`).toBe(`${selector}: true`)
      }
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  // The one line the design settled and the hub must never lose (the show-night design, part 1).
  test('the hub says the door never sells tickets', async () => {
    const view = await openView(PHONE)
    try {
      await visit(view, `${app.baseURL}/tonight`)
      expect(await view.evaluate<string>('document.body.innerText')).toContain('The door never sells tickets')
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
      await visit(view, `${app.baseURL}/tonight/glance`)
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
      // Not just "changed": a transient "Syncing" during the refetch also differs from `before`
      // and would satisfy that alone, racing ahead of the settled label this assertion reads.
      await waitFor(view, `/Last synced \\d\\d:\\d\\d/.test(document.querySelector('[data-test="night-stale"]')?.innerText ?? '') `
      + `&& document.querySelector('[data-test="night-stale"]').innerText !== ${JSON.stringify(before)}`)
      expect(acceptableLabels(SKEW_MS)).toContain(await textOf(view, '[data-test="night-stale"]'))
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

// The pinned slot is the one thing a thumb finds in the dark, so it holds something this viewer
// can actually do (K-102 criterion 2, issue 1150 items 10 and 14).
describe.skipIf(skip !== null)('what each show-night screen pins (issue 1150 items 10, 12, 13, 14)', () => {
  test('the glance pins its own refresh where the viewer cannot close the night', async () => {
    const view = await openView(PHONE)
    try {
      await visit(view, `${app.baseURL}/tonight/glance`)
      expect(await textOf(view, '[data-test="night-actions"]')).toContain('Refresh the numbers')
      expect(await textOf(view, '[data-test="night-actions"]')).not.toContain('Close the night')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('the board pins its own composer and keeps Reset out of the thumb\'s way', async () => {
    const view = await openView(PHONE)
    try {
      await visit(view, `${app.baseURL}/tonight/board`)
      const pinned = await textOf(view, '[data-test="night-actions"]')
      expect(pinned).not.toContain('Reset the board')
      await waitFor(view, 'document.querySelector(\'[data-test="night-actions"] [data-test="board-free-text-submit"]\')')
      const reset = await boxOf(view, '[data-test="board-reset-open"]')
      expect(reset.height).toBeGreaterThanOrEqual(NIGHT_TAP_TARGET_PX)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('the incident log pins the incident, with the near miss one tap on from it', async () => {
    const view = await openView(PHONE)
    try {
      await visit(view, `${app.baseURL}/tonight/incidents`)
      const pinned = await textOf(view, '[data-test="night-actions"]')
      expect(pinned).toContain('Log an incident')
      expect(pinned).toContain('Report a near miss')
      expect(pinned.indexOf('Log an incident')).toBeLessThan(pinned.indexOf('Report a near miss'))
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('the emergency card pins Call 999 as a dialling link', async () => {
    const view = await openView(PHONE)
    try {
      await visit(view, `${app.baseURL}/tonight/emergency`)
      const pinned = await boxOf(view, '[data-test="night-actions"] a[href="tel:999"]')
      expect(pinned.height).toBeGreaterThanOrEqual(NIGHT_TAP_TARGET_PX)
      expect(await textOf(view, '[data-test="night-actions"]')).toContain('Call 999')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

// Rule 4 of docs/design-language.md, measured rather than asserted from the source: every control
// on a show-night screen clears 48 by 48, not only the primary actions (issue 1150 item 15).
describe.skipIf(skip !== null)('the target floor holds for every control (K-102, issue 1150 item 15)', () => {
  // The till is audited by its own suites; these are the screens outside it.
  const SCREENS = ['/tonight', '/tonight/glance', '/tonight/board', '/tonight/incidents', '/tonight/age-checks', '/tonight/emergency']

  // Zero-sized elements are the ones a `v-if` has taken out, which are not controls anybody can
  // miss; everything with a box on the page is measured.
  const CONTROLS = `(() => {
    const seen = []
    for (const node of document.querySelectorAll('button, input, select, textarea, [role="combobox"], a[href]')) {
      const rect = node.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      if (getComputedStyle(node).display === 'inline') continue
      seen.push({ what: node.getAttribute('data-test') ?? node.tagName.toLowerCase(), width: rect.width, height: rect.height })
    }
    return JSON.stringify(seen)
  })()`

  for (const path of SCREENS) {
    test(`every control on ${path} is a thumb-sized target`, async () => {
      const view = await openView(PHONE)
      try {
        await visit(view, `${app.baseURL}${path}`)
        const controls = JSON.parse(await view.evaluate<string>(CONTROLS)) as { what: string, width: number, height: number }[]
        expect(controls.length).toBeGreaterThan(0)
        const short = controls.filter(one => one.height < NIGHT_TAP_TARGET_PX || one.width < NIGHT_TAP_TARGET_PX)
        expect(short.map(one => `${one.what} ${Math.round(one.width)}x${Math.round(one.height)}`)).toEqual([])
      }
      finally {
        view.close()
      }
    }, CASE_TIMEOUT_MS)
  }
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
