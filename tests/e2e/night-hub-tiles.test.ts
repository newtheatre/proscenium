import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { registerMember } from '#tests/helpers/accounts'
import { testVenue, tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// The hub is the night's destinations, one tile each (E-112 criterion 4, issue 1150 item 3): the
// checklist and the Challenge 25 register were each a tap further in, through another screen.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000

let app: AppUnderTest
let dutyManager: TestMember
let dutyManagerPassword: string
let matineeId: string

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  dutyManagerPassword = generatePassword()
  dutyManager = await registerMember(app, 'hub-tiles-dm', dutyManagerPassword)

  const database = new Database(app.databaseFile)
  try {
    const target = sqliteTarget(database)
    const venue = testVenue(target, { suffix: 'hub-tiles-house' })
    const matinee = tonightsPerformance(target, { suffix: 'hub-tiles-matinee', venueId: venue.id, curtainHoursAfterNightStart: 10 })
    const evening = tonightsPerformance(target, { suffix: 'hub-tiles-evening', venueId: venue.id, curtainHoursAfterNightStart: 15.5 })
    matineeId = matinee.performanceId
    for (const [performanceId, suffix] of [[matinee.performanceId, 'matinee'], [evening.performanceId, 'evening']] as const) {
      database.query('INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)')
        .run(`hub-tiles-${suffix}-dm`, performanceId, 'DUTY_MANAGER', dutyManager.id, 'CONFIRMED')
    }
  }
  finally {
    database.close()
  }
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

async function signedInHub(): Promise<Bun.WebView> {
  const view = await openSignedOutView(app.baseURL)
  await visit(view, `${app.baseURL}/sign-in`)
  await fill(view, 'form input[type="email"]', dutyManager.email)
  await fill(view, 'form input[type="password"]', dutyManagerPassword)
  await click(view, 'form button[type="submit"]')
  await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)
  await visit(view, `${app.baseURL}/tonight`, '[data-test="tonight-hub"]')
  return view
}

describe.skipIf(skip !== null)('every destination of the night is one tile (issue 1150 item 3)', () => {
  test('the checklist and the Challenge 25 register are on the hub, not a screen further in', async () => {
    const view = await signedInHub()
    try {
      await waitFor(view, `document.querySelector('[data-test="tile-checklist"]')`)
      const ageChecks = await view.evaluate<string>(
        `document.querySelector('[data-test="tile-age-checks"]').getAttribute('href')`,
      )
      expect(ageChecks).toBe('/tonight/age-checks')
      expect(await view.evaluate<string>('document.body.innerText')).toContain('Challenge 25')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  // On a matinee day the tile has to name the house, the way the glance and incidents tiles
  // already do, or the checklist opens on an ambiguity it could have been told (E-127 criterion 2).
  test('the checklist tile carries the performance the hub is showing', async () => {
    const view = await signedInHub()
    try {
      await waitFor(view, `document.querySelector('[data-test="performance-switcher"]')`)
      await click(view, `[data-test="choose-${matineeId}"]`)
      await waitFor(
        view,
        `document.querySelector('[data-test="tile-checklist"]').getAttribute('href') === '/tonight/checklist?performanceId=${matineeId}'`,
      )
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
