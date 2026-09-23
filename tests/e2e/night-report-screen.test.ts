import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { registerMember } from '#tests/helpers/accounts'
import { testVenue, tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// The sign-off screen through a real browser (issue 1053, E-124 criteria 1 and 2, E-123
// criterion 4). The route's own guard and freeze are pinned in `night-signoff.test.ts`.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000
const NOTE = '[data-test="closing-note"] textarea, textarea[data-test="closing-note"]'

let app: AppUnderTest

beforeAll(async () => {
  if (skip) return
  app = await startApp()
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

function write(statement: string, ...parameters: unknown[]): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(statement).run(...parameters as never[])
  }
  finally {
    database.close()
  }
}

async function dutyManagerOn(suffix: string, curtains: number[]): Promise<{ id: string, password: string, email: string, performanceIds: string[] }> {
  const password = generatePassword()
  const member = await registerMember(app, `report-screen-${suffix}`, password)
  const database = new Database(app.databaseFile)
  const performanceIds: string[] = []
  try {
    const target = sqliteTarget(database)
    const venue = testVenue(target, { suffix: `report-screen-${suffix}` })
    curtains.forEach((hours, index) => {
      const { performanceId } = tonightsPerformance(target, { suffix: `report-screen-${suffix}-${index}`, venueId: venue.id, curtainHoursAfterNightStart: hours })
      database.query('INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)')
        .run(`report-screen-${suffix}-${index}-dm`, performanceId, 'DUTY_MANAGER', member.id, 'CONFIRMED')
      performanceIds.push(performanceId)
    })
  }
  finally {
    database.close()
  }
  return { id: member.id, password, email: member.email, performanceIds }
}

async function signedIn(email: string, password: string): Promise<Bun.WebView> {
  const view = await openSignedOutView(app.baseURL)
  await visit(view, `${app.baseURL}/sign-in`)
  await fill(view, 'form input[type="email"]', email)
  await fill(view, 'form input[type="password"]', password)
  await click(view, 'form button[type="submit"]')
  await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)
  return view
}

describe.skipIf(skip !== null)('signing off the night by hand (issue 1053)', () => {
  test('the draft renders, the checklist gate refuses in words, and a closed night signs off', async () => {
    const { id, email, password, performanceIds } = await dutyManagerOn('single', [15.5])
    const view = await signedIn(email, password)
    try {
      await visit(view, `${app.baseURL}/tonight`, '[data-test="tonight-hub"]')
      await waitFor(view, `document.querySelector('[data-test="tile-report"]')`)

      await visit(view, `${app.baseURL}/tonight/report`)
      await waitFor(view, `document.querySelector('[data-test="report-draft"]')`)
      expect(await textOf(view, '[data-test="report-draft"]')).toContain('Attendance')

      await fill(view, NOTE, 'A quiet house, nothing to report.')
      await click(view, '[data-test="sign-off"]')
      await waitFor(view, `document.querySelector('[data-test="sign-off-failure"]')`)
      expect(await textOf(view, '[data-test="sign-off-failure"]')).toContain('checklist has not been closed')
      expect(await view.evaluate<boolean>(`Boolean(document.querySelector('[data-test="open-checklist"]'))`)).toBe(true)

      write('INSERT INTO checklist_closes (id, performance_id, closed_by) VALUES (?, ?, ?)', 'report-screen-close', performanceIds[0], id)
      await click(view, '[data-test="sign-off"]')
      await waitFor(view, `document.querySelector('[data-test="report-signed"]')`)
      const signed = await textOf(view, '[data-test="report-signed"]')
      expect(signed).toContain('Signed off by')
      expect(signed).toContain('A quiet house, nothing to report.')
      expect(await view.evaluate<boolean>(`Boolean(document.querySelector('[data-test="sign-off"]'))`)).toBe(false)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('a matinee day opened cold asks which house before showing either report', async () => {
    const { email, password, performanceIds } = await dutyManagerOn('matinee', [10, 15.5])
    const view = await signedIn(email, password)
    try {
      await visit(view, `${app.baseURL}/tonight/report`)
      await waitFor(view, `document.querySelector('[data-test="report-performance-switcher"]')`)
      await click(view, `[data-test="choose-${performanceIds[0]}"]`)
      await waitFor(view, `document.querySelector('[data-test="report-draft"]')`)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
