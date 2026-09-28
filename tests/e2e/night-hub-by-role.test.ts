import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { registerMember } from '#tests/helpers/accounts'
import { sqliteTarget } from '#tests/helpers/database'
import { testVenue, tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// Issue 1304 through the real screens: the hub shows what the viewer's own job opens, a refused
// screen is one card with nothing left to press, and a console refusal names who it is for.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000

let app: AppUnderTest
const passwords = new Map<string, string>()
let door: TestMember
let nobody: TestMember

async function member(prefix: string): Promise<TestMember> {
  const password = generatePassword()
  const made = await registerMember(app, prefix, password)
  passwords.set(made.id, password)
  return made
}

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  door = await member('hub-role-door')
  nobody = await member('hub-role-nobody')

  const database = new Database(app.databaseFile)
  try {
    const target = sqliteTarget(database)
    const venueId = testVenue(target, { suffix: 'hub-role' }).id
    const performanceId = tonightsPerformance(target, { suffix: 'hub-role', venueId }).performanceId
    database.query('INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)')
      .run('hub-role-door-shift', performanceId, 'DOOR', door.id, 'CONFIRMED')
  }
  finally {
    database.close()
  }
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

async function signedIn(who: TestMember): Promise<Bun.WebView> {
  const view = await openSignedOutView(app.baseURL)
  await visit(view, `${app.baseURL}/sign-in`)
  await fill(view, 'form input[type="email"]', who.email)
  await fill(view, 'form input[type="password"]', passwords.get(who.id)!)
  await click(view, 'form button[type="submit"]')
  await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)
  return view
}

const tileIds = `[...document.querySelectorAll('[data-test="tonight-hub"] > a')].map(tile => tile.getAttribute('data-test'))`

describe.skipIf(skip !== null)('the hub by the viewer\'s own job (issue 1304)', () => {
  test('a door shift leads with the door and is offered nothing that refuses it', async () => {
    const view = await signedIn(door)
    try {
      await visit(view, `${app.baseURL}/tonight`, '[data-test="tonight-hub"]')
      await waitFor(view, `${tileIds}.length === 5`)
      expect(await view.evaluate<string[]>(tileIds)).toEqual(['tile-door', 'tile-glance', 'tile-age-checks', 'tile-contacts', 'tile-emergency'])
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  // A phone's slow answer, stood in for by holding the page's own authority reads; every set of
  // tiles the hub draws on the way is recorded, since the flicker is in the frames between.
  test('arriving from elsewhere on the site, the hub never draws a tile it then takes away (issue 1521)', async () => {
    const view = await signedIn(door)
    try {
      await visit(view, `${app.baseURL}/my`, '[data-test="on-shift-bar"]')
      await view.evaluate(`(() => {
        const real = window.fetch
        window.fetch = (input, init) => String(typeof input === 'string' ? input : input.url).includes('/api/tonight/authority')
          ? new Promise(resolve => setTimeout(resolve, 1500)).then(() => real(input, init))
          : real(input, init)
        window.hubDrawn = []
        new MutationObserver(() => {
          const hub = document.querySelector('[data-test="tonight-hub"]')
          if (!hub) return
          const drawn = [...hub.querySelectorAll(':scope > a')].map(tile => tile.getAttribute('data-test'))
          if (document.querySelector('[data-test="hub-no-role"]')) drawn.push('hub-no-role')
          if (JSON.stringify(drawn) !== JSON.stringify(window.hubDrawn.at(-1))) window.hubDrawn.push(drawn)
        }).observe(document.body, { childList: true, subtree: true })
        return true
      })()`)
      await click(view, '[data-test="on-shift-bar"] a[href="/tonight"]')
      await waitFor(view, `${tileIds}.length === 5`)

      const own = ['tile-door', 'tile-glance', 'tile-age-checks', 'tile-contacts', 'tile-emergency']
      expect(await view.evaluate<string[]>(tileIds)).toEqual(own)
      const drawn = await view.evaluate<string[][]>('window.hubDrawn')
      expect(drawn[0]).toEqual(['tile-emergency'])
      expect(drawn.flat().filter(id => !own.includes(id))).toEqual([])
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('nobody on shift gets Emergency and one card with their rota', async () => {
    const view = await signedIn(nobody)
    try {
      await visit(view, `${app.baseURL}/tonight`, '[data-test="tonight-hub"]')
      await waitFor(view, `document.querySelector('[data-test="hub-no-role"]')`)
      expect(await view.evaluate<string[]>(tileIds)).toEqual(['tile-emergency'])
      expect(await view.evaluate<string | null>(`document.querySelector('[data-test="hub-my-rota"]')?.getAttribute('href') ?? null`)).toBe('/rota')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('a screen that refuses is one card with the way back, and none of its own controls', async () => {
    const view = await signedIn(door)
    try {
      await visit(view, `${app.baseURL}/tonight/board`, '[data-test="night-refusal"]')
      expect(await textOf(view, '[data-test="night-refusal-help"]')).toContain('duty manager')
      expect(await view.evaluate<number>(`document.querySelectorAll('[data-test="board-free-text-form"], [data-test="board-reset-open"]').length`)).toBe(0)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('a console refusal names who the screen is for, and offers My NNT and Tonight', async () => {
    const view = await signedIn(nobody)
    try {
      await visit(view, `${app.baseURL}/box-office/desk`, '[data-test="error-ways"]')
      const said = await view.evaluate<string>('document.body.innerText')
      expect(said).toContain('Front of House Manager')
      expect(said).not.toContain('ask the IT Manager')
      expect(await view.evaluate<string[]>(`[...document.querySelectorAll('[data-test="error-ways"] a')].map(way => way.getAttribute('href'))`)).toEqual(['/my', '/tonight'])
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
