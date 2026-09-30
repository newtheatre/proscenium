import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { grantCommitteeRole, registerMember } from '#tests/helpers/accounts'
import { testVenue, tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { showNightOf, showNightOpensAt } from '#shared/utils/show-night'
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

function read<T>(statement: string, ...parameters: unknown[]): T[] {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query(statement).all(...parameters as never[]) as T[]
  }
  finally {
    database.close()
  }
}

// Half of tonight so far, with no running time: a curtain already down whenever the suite runs (0078).
function curtainAlreadyDown(): number {
  const now = new Date()
  return (now.getTime() / 1000 - showNightOpensAt(showNightOf(now))) / 3600 / 2
}

async function dutyManagerOn(suffix: string, curtains: (number | undefined)[]): Promise<{ id: string, password: string, email: string, venueId: string, performanceIds: string[] }> {
  const password = generatePassword()
  const member = await registerMember(app, `report-screen-${suffix}`, password)
  grantCommitteeRole(app, member.id)
  const database = new Database(app.databaseFile)
  const performanceIds: string[] = []
  let venueId: string
  try {
    const target = sqliteTarget(database)
    const venue = testVenue(target, { suffix: `report-screen-${suffix}` })
    venueId = venue.id
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
  return { id: member.id, password, email: member.email, venueId, performanceIds }
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
  // Issue 1315: the draft reads all evening, and nothing final waits under the thumb before the curtain.
  test('before the curtain the draft pins nothing and says when Sign off and close opens', async () => {
    const { email, password } = await dutyManagerOn('ahead', [undefined])
    const view = await signedIn(email, password)
    try {
      await visit(view, `${app.baseURL}/tonight/report`)
      await waitFor(view, `document.querySelector('[data-test="report-draft"]')`)
      expect(await textOf(view, '[data-test="report-draft"]')).toContain('Walk-ups')
      expect(await textOf(view, '[data-test="sign-off-opens"]')).toContain('Sign off and close opens at')
      expect(await view.evaluate<boolean>(`Boolean(document.querySelector('[data-test="night-actions"]'))`)).toBe(false)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('after the curtain the hub leads with the report, an open item ticks in place, and one press closes the night', async () => {
    const { id, email, password, venueId, performanceIds } = await dutyManagerOn('down', [curtainAlreadyDown()])
    const performanceId = performanceIds[0]!
    write('UPDATE performances SET duration_minutes = NULL WHERE id = ?', performanceId)
    write(`INSERT INTO checklist_items (id, venue_id, phase, label, sort, required) VALUES (?, ?, 'POST', 'Bar shutters down', 1, 1)`, 'report-screen-down-item', venueId)
    write(`INSERT INTO incidents (id, performance_id, reported_by, category, severity, body) VALUES (?, ?, ?, 'SAFETY', 'NOTE', 'A drink went over.')`, 'report-screen-down-incident', performanceId, id)
    const view = await signedIn(email, password)
    try {
      await visit(view, `${app.baseURL}/tonight`, '[data-test="tonight-hub"]')
      await waitFor(view, `document.querySelector('[data-test="tonight-hub"] > a:first-child')?.dataset.test === 'tile-report'`)

      await visit(view, `${app.baseURL}/tonight/glance`)
      await waitFor(view, `(document.querySelector('[data-test="night-actions"]')?.innerText ?? '').includes('Night report')`)

      await visit(view, `${app.baseURL}/tonight/report`)
      await waitFor(view, `document.querySelector('[data-test="report-open-items"]')`)
      expect(await textOf(view, '[data-test="report-open-items"]')).toContain('Bar shutters down')
      await click(view, '[data-test="report-open-items"] [data-test^="tick-"]')
      await waitFor(view, `!document.querySelector('[data-test="report-open-items"]')`)

      await fill(view, NOTE, 'A quiet house, nothing to report.')
      await click(view, '[data-test="sign-off"]')
      await waitFor(view, `document.querySelector('[data-test="report-signed"]')`)
      const signed = await textOf(view, '[data-test="report-signed"]')
      expect(signed).toContain('Signed off by')
      expect(signed).toContain('A quiet house, nothing to report.')
      expect(await view.evaluate<boolean>(`Boolean(document.querySelector('[data-test="sign-off"]'))`)).toBe(false)
      expect(read('SELECT id FROM checklist_closes WHERE performance_id = ?', performanceId)).toHaveLength(1)
      expect(read(`SELECT id FROM audit_log WHERE action = 'incident.reviewed' AND target = ?`, 'incident:report-screen-down-incident')).toHaveLength(1)
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
