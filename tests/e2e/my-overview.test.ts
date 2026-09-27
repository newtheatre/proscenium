import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { registerMember } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, openView, skipReason, startApp, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// Issue 1153 item 3, K-127 criterion 6: on My NNT the whole tile is the link, a thumb's height at
// least, and the tiles with nothing behind them are one list of things to do, a line each.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000
const PHONE = { width: 500, height: 1100 }

let app: AppUnderTest
let member: TestMember
const password = generatePassword()

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  member = await registerMember(app, 'overview', password, { signIn: false })
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

// One browser backs every view, so signing out first is what makes the phone-sized view a fresh one.
async function signedInOnMy(): Promise<Bun.WebView> {
  const signedOut = await openSignedOutView(app.baseURL)
  signedOut.close()
  const view = await openView(PHONE)
  await visit(view, `${app.baseURL}/sign-in`)
  await fill(view, 'form input[type="email"]', member.email)
  await fill(view, 'form input[type="password"]', password)
  await click(view, 'form button[type="submit"]')
  await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)
  await visit(view, `${app.baseURL}/my`, '[data-test="my-page"]')
  await waitFor(view, `document.querySelector('[data-test="my-tile-membership"]')`)
  return view
}

interface Measured { name: string, links: number, height: number }

describe.skipIf(skip !== null)('My NNT on a phone (issue 1153 item 3)', () => {
  test('every tile is one link, the whole card, at least 48px tall', async () => {
    const view = await signedInOnMy()
    try {
      const tiles = await view.evaluate<Measured[]>(`[...document.querySelectorAll('[data-test^="my-tile-"]')].map(tile => ({
        name: tile.getAttribute('data-test'),
        links: tile.querySelectorAll('a').length,
        height: Math.min(tile.querySelector('a > span[aria-hidden="true"]')?.getBoundingClientRect().height ?? 0, tile.getBoundingClientRect().height),
      }))`)
      expect(tiles.length).toBeGreaterThan(0)
      for (const tile of tiles) {
        expect(`${tile.name}: ${tile.links}`).toBe(`${tile.name}: 1`)
        expect(tile.height).toBeGreaterThanOrEqual(48)
      }
      const covered = await view.evaluate<boolean>(`[...document.querySelectorAll('[data-test^="my-tile-"]')].every((tile) => {
        const target = tile.querySelector('a > span[aria-hidden="true"]')?.getBoundingClientRect()
        return Boolean(target) && Math.abs(target.height - tile.getBoundingClientRect().height) < 2
      })`)
      expect(covered).toBe(true)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('the empty tiles of a new member are one list, each line a link to the one thing that fills it', async () => {
    const view = await signedInOnMy()
    try {
      await waitFor(view, `document.querySelector('[data-test="my-things-to-do"]')`)
      const lines = await view.evaluate<Measured[]>(`[...document.querySelectorAll('[data-test^="my-thing-"]')].map(line => ({
        name: line.getAttribute('data-test'),
        links: line.tagName === 'A' ? 1 + line.querySelectorAll('a').length : line.querySelectorAll('a').length,
        height: line.getBoundingClientRect().height,
      }))`)
      expect(lines.map(line => line.name)).toContain('my-thing-passes')
      expect(lines.map(line => line.name)).toContain('my-thing-room')
      for (const line of lines) {
        expect(`${line.name}: ${line.links}`).toBe(`${line.name}: 1`)
        expect(line.height).toBeGreaterThanOrEqual(48)
      }
      // A line on the list is not also a tile.
      expect(await view.evaluate<boolean>(`document.querySelector('[data-test="my-tile-passes"]') === null`)).toBe(true)
      expect(await view.evaluate<boolean>(`document.querySelector('[data-test="my-tile-next-room-booking"]') === null`)).toBe(true)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('a tile says its action after its content, where the eye ends', async () => {
    const view = await signedInOnMy()
    try {
      const last = await view.evaluate<string>(`[...document.querySelector('[data-test="my-tile-membership"]').querySelectorAll('p, span')].filter(node => node.innerText.trim()).at(-1)?.innerText.trim() ?? ''`)
      expect(last).toBe('Manage membership')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
