import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { adminSession, finishSignIn, grantRole, registerMember, request } from '#tests/helpers/accounts'
import { clearConfigOverride, overrideConfig } from '#tests/helpers/config'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { sellOnTheTill } from '#tests/helpers/till'
import { click, fill, fillNumber, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import { currentShowNight } from '#shared/utils/show-night'
import { officerBypassTarget } from '#shared/utils/night-authority'
import { NIGHT_TAP_TARGET_PX, NIGHT_VIEWPORT_PX } from '#shared/utils/night-shell'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// F-101 and F-102 through the real routes, both branches of E-111's guard: a confirmed BAR shift
// opens the till on its own, and the officer role remains the fallback when no shift covers it.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let admin: TestMember
let foh: TestMember
let bar: TestMember
let bar2: TestMember
let member: TestMember
let house: { venueId: string, performanceId: string }
let studio: { venueId: string, performanceId: string }

const night = currentShowNight()

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)

  foh = await registerMember(app, 'till-foh', generatePassword())
  bar = await registerMember(app, 'till-bar', generatePassword())
  bar2 = await registerMember(app, 'till-bar2', generatePassword())
  member = await registerMember(app, 'till-ordinary', generatePassword())
  await grantRole(app, foh, 'FOH_MANAGER', admin.cookie)
  await grantRole(app, bar, 'BAR_MANAGER', admin.cookie)
  await grantRole(app, bar2, 'BAR_MANAGER', admin.cookie)

  house = programme('till-house')
  studio = programme('till-studio')
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

function programme(suffix: string): { venueId: string, performanceId: string } {
  const database = new Database(app.databaseFile)
  try {
    const made = tonightsPerformance(sqliteTarget(database), { suffix })
    return { venueId: made.venueId, performanceId: made.performanceId }
  }
  finally {
    database.close()
  }
}

async function message(response: Response): Promise<string> {
  const body = await response.json() as { statusMessage?: string, message?: string }
  return body.statusMessage ?? body.message ?? ''
}

interface TillSessionBody {
  id: string
  venueId: string
  night: string
  openedBy: string
  openedAt: number
  closedBy: string | null
  closedAt: number | null
  expectedTotalPence: number | null
  actualZPence: number | null
  variancePence: number | null
  varianceNote: string | null
}

const openTill = (venueId: string, as?: string): Promise<Response> =>
  request(app, 'POST', '/api/till', { venueId }, as)

// Nothing sold in this file's own fixtures, so the reader agrees with the ledger at nought and no
// note is needed; the figure itself and a disagreeing reading are F-118's own e2e suite.
const closeTill = (id: string, as?: string, actualZPence = 0, varianceNote?: string): Promise<Response> =>
  request(app, 'POST', '/api/till/close', { id, actualZPence, varianceNote }, as)

const tillStatus = (venueId: string, as?: string): Promise<Response> =>
  request(app, 'GET', `/api/till?venueId=${venueId}`, undefined, as)

function auditCount(action: string, target: string): number {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    const row = database
      .query('SELECT count(*) AS total FROM audit_log WHERE action = ? AND target = ?')
      .get(action, target) as { total: number }
    return row.total
  }
  finally {
    database.close()
  }
}

function insertStaleSession(venueId: string, staleNight: string, openedBy: string): string {
  const database = new Database(app.databaseFile)
  try {
    const id = `stale-${venueId}-${staleNight}`
    database.prepare('INSERT INTO till_sessions (id, venue_id, night, opened_by, opened_at) VALUES (?, ?, ?, ?, 1000)')
      .run(id, venueId, staleNight, openedBy)
    return id
  }
  finally {
    database.close()
  }
}

const today = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

async function aSellableProduct(pricePence: number, ageRestricted = false): Promise<{ productId: string, variantId: string }> {
  const categoryAnswered = await request(app, 'POST', '/api/admin/bar/categories', { name: `Variance ${crypto.randomUUID().slice(0, 6)}` }, admin.cookie)
  const { id: categoryId } = await categoryAnswered.json() as { id: string }
  const productAnswered = await request(app, 'POST', '/api/admin/bar/products', { name: `Variance ${crypto.randomUUID().slice(0, 6)}`, categoryId, ageRestricted }, admin.cookie)
  const { id: productId } = await productAnswered.json() as { id: string }
  const variantAnswered = await request(app, 'POST', '/api/admin/bar/variants', { productId, servingKind: 'single', label: 'Single' }, admin.cookie)
  const { id: variantId } = await variantAnswered.json() as { id: string }
  await request(app, 'POST', `/api/admin/bar/variants/${variantId}/prices`, { pricePence, effectiveFrom: today() }, admin.cookie)
  await request(app, 'POST', `/api/admin/bar/products/${productId}/status`, { status: 'ACTIVE' }, admin.cookie)
  return { productId, variantId }
}

let nextSlot = 100

function shiftFor(performanceId: string, role: string, userId: string, status = 'CONFIRMED'): string {
  const database = new Database(app.databaseFile)
  try {
    const id = `${performanceId}-${role}-${(nextSlot += 1)}`
    database.query('INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, performanceId, role, nextSlot, userId, status)
    return id
  }
  finally {
    database.close()
  }
}

describe.skipIf(skip !== null)('the till opens only to tonight\'s bar authority (F-101 criteria 1, 2, 5)', () => {
  test('the bar manager opens the till', async () => {
    const response = await openTill(house.venueId, bar.cookie)
    expect(response.status).toBe(200)
    const body = await response.json() as { ok: boolean, opened: boolean, session: TillSessionBody }
    expect(body.opened).toBe(true)
    expect(body.session).toMatchObject({ venueId: house.venueId, night, openedBy: bar.id, closedAt: null })
  })

  // The rota, not a standing grant: a confirmed bar shift opens the till with no officer role held
  // at all, and resolves via the shift branch rather than recording an officer bypass (0044).
  test('a confirmed bar shift opens the till, with no bar manager role at all', async () => {
    const shiftVenue = programme('till-shift-bar')
    const holder = await registerMember(app, 'till-shift-bar', generatePassword())
    shiftFor(shiftVenue.performanceId, 'BAR', holder.id)

    const response = await openTill(shiftVenue.venueId, holder.cookie)
    expect(response.status).toBe(200)
    const body = await response.json() as { ok: boolean, opened: boolean, session: TillSessionBody }
    expect(body.opened).toBe(true)
    expect(body.session).toMatchObject({ venueId: shiftVenue.venueId, night, openedBy: holder.id, closedAt: null })
    expect(auditCount('night.officer-bypass', officerBypassTarget(night, shiftVenue.venueId, 'BAR'))).toBe(0)
  })

  // A door shift is not bar authority, so the roles stay refused even though the holder is
  // rostered tonight: the shift branch does not blur what F-101 criterion 2 keeps apart.
  test('a confirmed door shift does not open the till: the roles are not interchangeable', async () => {
    const shiftVenue = programme('till-shift-door')
    const holder = await registerMember(app, 'till-shift-door', generatePassword())
    shiftFor(shiftVenue.performanceId, 'DOOR', holder.id)

    const response = await openTill(shiftVenue.venueId, holder.cookie)
    expect(response.status).toBe(403)
    const refusal = await message(response)
    expect(refusal).toContain('a confirmed bar shift')
    expect(refusal).toContain('Bar Manager\'s role')
  })

  test('the front of house officer does not open the till', async () => {
    const response = await openTill(studio.venueId, foh.cookie)
    expect(response.status).toBe(403)
    expect(await message(response)).toContain('Bar Manager\'s role')
  })

  test('an ordinary member is refused, and told what would unlock it', async () => {
    const response = await openTill(studio.venueId, member.cookie)
    expect(response.status).toBe(403)
    const refusal = await message(response)
    expect(refusal).toContain('a confirmed bar shift')
    expect(refusal).toContain('Bar Manager\'s role')
  })

  test('a signed-out caller gets no further', async () => {
    expect((await openTill(studio.venueId)).status).toBe(401)
  })
})

describe.skipIf(skip !== null)('authority is checked on every request, not cached (F-101 criterion 3)', () => {
  test('revoking the bar manager role refuses the very next request', async () => {
    const volunteer = await registerMember(app, 'till-revoked', generatePassword())
    await grantRole(app, volunteer, 'BAR_MANAGER', admin.cookie)

    expect((await openTill(studio.venueId, volunteer.cookie)).status).toBe(200)

    await request(app, 'DELETE', '/api/admin/roles', { userId: volunteer.id, role: 'BAR_MANAGER' }, admin.cookie)

    const refused = await tillStatus(studio.venueId, volunteer.cookie)
    expect(refused.status).toBe(403)
  })
})

describe.skipIf(skip !== null)('one session per venue per night, however many ask for it (F-102 criteria 1, 2)', () => {
  test('nothing is open before anybody opens it', async () => {
    const fresh = programme('till-fresh')
    const status = await (await tillStatus(fresh.venueId, bar.cookie)).json() as { session: TillSessionBody | null }
    expect(status.session).toBeNull()
  })

  test('two bar managers racing the same venue and night resolve to one session', async () => {
    const raced = programme('till-race')

    const [first, second] = await Promise.all([
      openTill(raced.venueId, bar.cookie),
      openTill(raced.venueId, bar2.cookie),
    ])
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)

    const firstBody = await first.json() as { opened: boolean, session: TillSessionBody }
    const secondBody = await second.json() as { opened: boolean, session: TillSessionBody }

    // Exactly one of the two created it; the other joined what the winner made.
    expect([firstBody.opened, secondBody.opened].filter(Boolean)).toHaveLength(1)
    expect(firstBody.session.id).toBe(secondBody.session.id)
    expect(auditCount('bar.till.opened', `till:${raced.venueId}:${night}`)).toBe(1)

    const status = await (await tillStatus(raced.venueId, bar.cookie)).json() as { session: TillSessionBody | null }
    expect(status.session?.id).toBe(firstBody.session.id)
  })

  test('opening it again just returns the same session', async () => {
    const again = programme('till-again')
    const first = await (await openTill(again.venueId, bar.cookie)).json() as { session: TillSessionBody }
    const second = await (await openTill(again.venueId, bar.cookie)).json() as { opened: boolean, session: TillSessionBody }
    expect(second.opened).toBe(false)
    expect(second.session.id).toBe(first.session.id)
  })
})

describe.skipIf(skip !== null)('closing a session (F-102 criterion 4)', () => {
  test('the bar manager closes tonight\'s session, stamped with who and when', async () => {
    const closing = programme('till-closing')
    const opened = await (await openTill(closing.venueId, bar.cookie)).json() as { session: TillSessionBody }

    const response = await closeTill(opened.session.id, bar.cookie)
    expect(response.status).toBe(200)
    const closed = await response.json() as { session: TillSessionBody }
    expect(closed.session).toMatchObject({
      id: opened.session.id, closedBy: bar.id, expectedTotalPence: 0, actualZPence: 0, variancePence: 0, varianceNote: null,
    })
    expect(closed.session.closedAt).not.toBeNull()

    expect(auditCount('bar.till.closed', `till:${closing.venueId}:${night}`)).toBe(1)
  })

  // The unique index covers open rows only (data-model.md, till sessions): a closed session is
  // history, not a slot waiting to be reused.
  test('a fresh session can open again after the last one closed', async () => {
    const reopened = programme('till-reopen')
    const first = await (await openTill(reopened.venueId, bar.cookie)).json() as { session: TillSessionBody }
    await closeTill(first.session.id, bar.cookie)

    const second = await openTill(reopened.venueId, bar.cookie)
    expect(second.status).toBe(200)
    const body = await second.json() as { opened: boolean, session: TillSessionBody }
    expect(body.opened).toBe(true)
    expect(body.session.id).not.toBe(first.session.id)
    expect(body.session.closedAt).toBeNull()
  })

  test('closing an already-closed session is refused', async () => {
    const closing = programme('till-double-close')
    const opened = await (await openTill(closing.venueId, bar.cookie)).json() as { session: TillSessionBody }
    await closeTill(opened.session.id, bar.cookie)

    const second = await closeTill(opened.session.id, bar.cookie)
    expect(second.status).toBe(409)
  })

  // The loser's Z reading and note are thrown away, so the loser has to be told plainly: a close
  // that answers "done" over somebody else's figure is the one lie this write must not tell.
  test('two closes at once leave one winner, and the loser is told whose reading stands', async () => {
    const closing = programme('till-race-close')
    const opened = await (await openTill(closing.venueId, bar.cookie)).json() as { session: TillSessionBody }

    const answers = await Promise.all([
      closeTill(opened.session.id, bar.cookie),
      closeTill(opened.session.id, bar.cookie),
    ])

    expect(answers.filter(answer => answer.status === 200)).toHaveLength(1)
    const loser = answers.find(answer => answer.status !== 200)!
    expect(loser.status).toBe(409)
    expect(await message(loser)).toContain('closed this session first')
  })

  test('an ordinary member cannot close tonight\'s session', async () => {
    const closing = programme('till-close-refusal')
    const opened = await (await openTill(closing.venueId, bar.cookie)).json() as { session: TillSessionBody }

    expect((await closeTill(opened.session.id, member.cookie)).status).toBe(403)
  })

  test('closing a session that does not exist is a 404', async () => {
    expect((await closeTill('no-such-session', bar.cookie)).status).toBe(404)
  })
})

describe.skipIf(skip !== null)('the screen', () => {
  // Close till is not a per-sale action, so the thumb zone is Charge and the SumUp hand-off
  // only (K-102 criterion 2).
  test('Close till is reached from the overflow menu, not the pinned actions, and still closes the session', async () => {
    const screenPassword = generatePassword()
    const screenBar = await registerMember(app, 'till-screen-close', screenPassword)
    await grantRole(app, screenBar, 'BAR_MANAGER', admin.cookie)
    const closing = programme('till-screen-close')
    await openTill(closing.venueId, screenBar.cookie)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', screenBar.email)
    await fill(view, 'form input[type="password"]', screenPassword)
    await click(view, 'form button[type="submit"]')
    await finishSignIn(app, view, screenBar.email)

    await visit(view, `${app.baseURL}/tonight/till?venueId=${closing.venueId}`, `[data-test="till-open"]`)
    expect(await view.evaluate<boolean>(`!!document.querySelector('[data-test="open-close-till"]')`)).toBe(false)

    await click(view, '[data-test="till-overflow-menu"]')
    await waitFor(view, `[...document.querySelectorAll('[role="menuitem"]')].some(el => el.textContent.includes('Close till'))`)
    await view.evaluate(`[...document.querySelectorAll('[role="menuitem"]')].find(el => el.textContent.includes('Close till')).click()`)
    await waitFor(view, `document.querySelector('[data-test="confirm-close-till"]')`)
    await click(view, '[data-test="confirm-close-till"]')
    await waitFor(view, `document.querySelector('[data-test="till-closed"]')`)
    view.close()
  }, 120_000)

  // F-118 criterion 3: a disagreeing reading needs a note before it can be recorded, so the
  // control that records it waits for one.
  test('Confirm close is disabled while a variance has no note, and enables once one is typed', async () => {
    const screenPassword = generatePassword()
    const screenBar = await registerMember(app, 'till-screen-variance', screenPassword)
    await grantRole(app, screenBar, 'BAR_MANAGER', admin.cookie)
    const closing = programme('till-screen-variance')
    await openTill(closing.venueId, screenBar.cookie)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', screenBar.email)
    await fill(view, 'form input[type="password"]', screenPassword)
    await click(view, 'form button[type="submit"]')
    await finishSignIn(app, view, screenBar.email)

    await visit(view, `${app.baseURL}/tonight/till?venueId=${closing.venueId}`, `[data-test="till-open"]`)
    await click(view, '[data-test="till-overflow-menu"]')
    await waitFor(view, `[...document.querySelectorAll('[role="menuitem"]')].some(el => el.textContent.includes('Close till'))`)
    await view.evaluate(`[...document.querySelectorAll('[role="menuitem"]')].find(el => el.textContent.includes('Close till')).click()`)
    await waitFor(view, `document.querySelector('[data-test="actual-z-input"]')`)

    // A blank field is not a reading, even though it prices as nought (finding 13 follow-up).
    expect(await view.evaluate<boolean>(`document.querySelector('[data-test="confirm-close-till"]').disabled`)).toBe(true)

    // Nothing sold, so any figure keyed in disagrees with the nought the ledger expects.
    await fillNumber(view, '[data-test="actual-z-input"]', '5')
    await waitFor(view, `document.querySelector('[data-test="variance-note"]')`)
    expect(await view.evaluate<boolean>(`document.querySelector('[data-test="confirm-close-till"]').disabled`)).toBe(true)

    await fill(view, '[data-test="variance-note"]', 'Counted twice, definitely £5 over')
    await waitFor(view, `!document.querySelector('[data-test="confirm-close-till"]').disabled`)

    await click(view, '[data-test="confirm-close-till"]')
    await waitFor(view, `document.querySelector('[data-test="till-closed"]')`)
    view.close()
  }, 120_000)

  // A note explains a figure; a figure it was never written for gets no say (finding 13 follow-up).
  test('correcting the Z figure clears a note written for the old one', async () => {
    const screenPassword = generatePassword()
    const screenBar = await registerMember(app, 'till-screen-correct', screenPassword)
    await grantRole(app, screenBar, 'BAR_MANAGER', admin.cookie)
    const closing = programme('till-screen-correct')
    await openTill(closing.venueId, screenBar.cookie)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', screenBar.email)
    await fill(view, 'form input[type="password"]', screenPassword)
    await click(view, 'form button[type="submit"]')
    await finishSignIn(app, view, screenBar.email)

    await visit(view, `${app.baseURL}/tonight/till?venueId=${closing.venueId}`, `[data-test="till-open"]`)
    await click(view, '[data-test="till-overflow-menu"]')
    await waitFor(view, `[...document.querySelectorAll('[role="menuitem"]')].some(el => el.textContent.includes('Close till'))`)
    await view.evaluate(`[...document.querySelectorAll('[role="menuitem"]')].find(el => el.textContent.includes('Close till')).click()`)
    await waitFor(view, `document.querySelector('[data-test="actual-z-input"]')`)

    await fillNumber(view, '[data-test="actual-z-input"]', '5')
    await waitFor(view, `document.querySelector('[data-test="variance-note"]')`)
    await fill(view, '[data-test="variance-note"]', 'Counted twice, definitely £5 over')
    await waitFor(view, `!document.querySelector('[data-test="confirm-close-till"]').disabled`)

    await fillNumber(view, '[data-test="actual-z-input"]', '6')
    await waitFor(view, `document.querySelector('[data-test="confirm-close-till"]').disabled`)
    expect(await view.evaluate<string>(`document.querySelector('[data-test="variance-note"]').value`)).toBe('')
    view.close()
  }, 120_000)

  // F-118 criterion 3: the server's own recomputed figure is the one that governs, so a sale
  // landing elsewhere while the modal sat open must not leave the note unreachable.
  test('a sale landing after the modal opens is caught by the refusal, and the note field catches up', async () => {
    const screenPassword = generatePassword()
    const screenBar = await registerMember(app, 'till-screen-refresh', screenPassword)
    await grantRole(app, screenBar, 'BAR_MANAGER', admin.cookie)
    const closing = programme('till-screen-refresh')
    await openTill(closing.venueId, screenBar.cookie)
    const { variantId } = await aSellableProduct(250)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', screenBar.email)
    await fill(view, 'form input[type="password"]', screenPassword)
    await click(view, 'form button[type="submit"]')
    await finishSignIn(app, view, screenBar.email)

    await visit(view, `${app.baseURL}/tonight/till?venueId=${closing.venueId}`, `[data-test="till-open"]`)
    await click(view, '[data-test="till-overflow-menu"]')
    await waitFor(view, `[...document.querySelectorAll('[role="menuitem"]')].some(el => el.textContent.includes('Close till'))`)
    await view.evaluate(`[...document.querySelectorAll('[role="menuitem"]')].find(el => el.textContent.includes('Close till')).click()`)
    await waitFor(view, `document.querySelector('[data-test="actual-z-input"]')`)

    // The modal opened on a nought expectation; a sale elsewhere then moves it to £2.50.
    await fillNumber(view, '[data-test="actual-z-input"]', '0')
    expect(await view.evaluate<boolean>(`!!document.querySelector('[data-test="variance-note"]')`)).toBe(false)

    await sellOnTheTill(app, { venueId: closing.venueId, lines: [{ variantId, qty: 1 }], expectedTotalPence: 250 }, screenBar.cookie)

    await click(view, '[data-test="confirm-close-till"]')
    await waitFor(view, `document.querySelector('[data-test="close-failure"]')`)
    await waitFor(view, `document.querySelector('[data-test="variance-note"]')`)
    expect(await textOf(view, '[data-test="expected-pence"]')).toContain('£2.50')
    // The close leads with the whole night's figure for the one reader (issue 1308).
    expect(await textOf(view, '[data-test="reader-should-show"]')).toContain('The reader should show £2.50')

    await fill(view, '[data-test="variance-note"]', 'A sale landed while the till was closing')
    await click(view, '[data-test="confirm-close-till"]')
    await waitFor(view, `document.querySelector('[data-test="till-closed"]')`)
    view.close()
  }, 120_000)
})

describe.skipIf(skip !== null)('a stale session waits for the bar manager, not tonight\'s shift (F-102 criterion 5)', () => {
  test('the bar manager closes a session left over from an earlier night', async () => {
    const stale = programme('till-stale')
    const id = insertStaleSession(stale.venueId, '2020-01-01', bar.id)

    const response = await closeTill(id, bar.cookie)
    expect(response.status).toBe(200)
    const closed = await response.json() as { session: TillSessionBody }
    expect(closed.session.closedBy).toBe(bar.id)
  })

  test('the front of house officer cannot reach back for it: it is the bar manager\'s role, not tonight\'s coverage', async () => {
    const stale = programme('till-stale-foh')
    const id = insertStaleSession(stale.venueId, '2020-01-01', bar.id)

    const response = await closeTill(id, foh.cookie)
    expect(response.status).toBe(403)
    expect(await message(response)).toContain('Bar Manager\'s role')
  })

  // Issue 1316: the till lists what an earlier night left open, for the one role that can act on it.
  test('the bar manager\'s till lists an earlier night\'s open session and unanswered charge; nobody else\'s does', async () => {
    const stale = programme('till-stale-listed')
    const id = insertStaleSession(stale.venueId, '2020-01-02', bar.id)
    const database = new Database(app.databaseFile)
    try {
      database.query(`INSERT INTO sumup_attempts (id, till_session_id, venue_id, night, created_by, basket, expected_total_pence, status, kind)
        VALUES (?, ?, ?, '2020-01-02', ?, '{}', 250, 'STARTED', 'TYPED')`).run(`earlier-${id}`, id, stale.venueId, bar.id)
    }
    finally {
      database.close()
    }

    const listed = await request(app, 'GET', '/api/till/earlier', undefined, bar.cookie)
    expect(listed.status).toBe(200)
    const body = await listed.json() as { sessions: { id: string, venueName: string, night: string }[], attempts: { id: string }[] }
    expect(body.sessions.find(session => session.id === id)).toMatchObject({ night: '2020-01-02' })
    expect(body.sessions.find(session => session.id === id)?.venueName).toBeTruthy()
    expect(body.attempts.map(attempt => attempt.id)).toContain(`earlier-${id}`)

    expect((await request(app, 'GET', '/api/till/earlier', undefined, foh.cookie)).status).toBe(403)
    // No shift reaches back into an ended night, tonight's confirmed bar shift included.
    const onShift = await registerMember(app, 'till-earlier-shift', generatePassword())
    shiftFor(stale.performanceId, 'BAR', onShift.id)
    expect((await request(app, 'GET', '/api/till/earlier', undefined, onShift.cookie)).status).toBe(403)
  })

  // A closed night's charge is not offered as recorded at the till: the Treasurer records it on
  // that night's Daily reconciliation (question 15, F-124 criterion 9).
  test('the bar manager closes last night\'s till from tonight\'s, then answers its charge the Treasurer now records', async () => {
    const screenPassword = generatePassword()
    const screenBar = await registerMember(app, 'till-screen-earlier', screenPassword)
    await grantRole(app, screenBar, 'BAR_MANAGER', admin.cookie)
    const tonight = programme('till-screen-earlier')
    await openTill(tonight.venueId, screenBar.cookie)
    const id = insertStaleSession(tonight.venueId, '2020-01-03', screenBar.id)
    const charge = `earlier-mismatch-${id}`
    const database = new Database(app.databaseFile)
    try {
      database.query(`INSERT INTO sumup_attempts (id, till_session_id, venue_id, night, created_by, basket, expected_total_pence, status, kind, error)
        VALUES (?, ?, ?, '2020-01-03', ?, '{}', 250, 'MISMATCH', 'TYPED', 'Recording the sale was interrupted')`).run(charge, id, tonight.venueId, screenBar.id)
    }
    finally {
      database.close()
    }

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', screenBar.email)
    await fill(view, 'form input[type="password"]', screenPassword)
    await click(view, 'form button[type="submit"]')
    await finishSignIn(app, view, screenBar.email)

    await visit(view, `${app.baseURL}/tonight/till?venueId=${tonight.venueId}`, `[data-test="till-open"]`)
    await waitFor(view, `document.querySelector('[data-test="earlier-close-${id}"]')`)
    expect(await textOf(view, '[data-test="till-earlier"]')).toContain('still open')
    // That night's till is still open, so recording the sale is still on offer.
    expect(await view.evaluate<boolean>(`!!document.querySelector('[data-test="earlier-succeeded-${charge}"]')`)).toBe(true)

    await click(view, `[data-test="earlier-close-${id}"]`)
    await waitFor(view, `document.querySelector('[data-test="actual-z-input"]')`)
    await fillNumber(view, '[data-test="actual-z-input"]', '0')
    await click(view, '[data-test="confirm-close-till"]')
    await waitFor(view, `!document.querySelector('[data-test="earlier-close-${id}"]')`)
    // Tonight's session is untouched by closing last night's.
    expect(await view.evaluate<boolean>(`!!document.querySelector('[data-test="till-open"]')`)).toBe(true)

    await waitFor(view, `document.querySelector('[data-test="earlier-treasurer-${charge}"]')`)
    expect(await view.evaluate<boolean>(`!!document.querySelector('[data-test="earlier-succeeded-${charge}"]')`)).toBe(false)
    expect(await textOf(view, `[data-test="earlier-treasurer-${charge}"]`)).toContain('the Treasurer records it')

    await fill(view, `[data-test="earlier-note-${charge}"]`, 'Reader took £2.50; told the Treasurer')
    await click(view, `[data-test="earlier-abandoned-${charge}"]`)
    await waitFor(view, `!document.querySelector('[data-test="earlier-attempt-${charge}"]')`)
    view.close()
  }, 120_000)
})

// Question 15, option 1 (F-124 criterion 9): the Treasurer records a charge a closed till left, as
// the sale it was on its own night, against the total the screen showed (0005).
describe.skipIf(skip !== null)('the Treasurer records a card charge left on a closed till', () => {
  function read<T>(statement: string, ...parameters: string[]): T[] {
    const database = new Database(app.databaseFile, { readonly: true })
    try {
      return database.query(statement).all(...parameters) as T[]
    }
    finally {
      database.close()
    }
  }

  test('the Treasurer records it once; the bar is refused, and so is a stale total', async () => {
    const treasurer = await registerMember(app, 'till-late-treasurer', generatePassword())
    await grantRole(app, treasurer, 'TREASURER', admin.cookie)
    const late = programme('till-late-charge')
    const { variantId } = await aSellableProduct(450)

    const opened = await (await openTill(late.venueId, bar.cookie)).json() as { session: { id: string } }
    const started = await request(app, 'POST', '/api/till/payments', { venueId: late.venueId, lines: [{ variantId, qty: 1 }], expectedTotalPence: 450, kind: 'TYPED' }, bar.cookie)
    expect(started.status).toBe(200)
    const { id: charge } = await started.json() as { id: string }
    // Nobody answered it before close: a closed till only ever holds a mismatch (close refuses otherwise).
    const database = new Database(app.databaseFile)
    try {
      database.query(`UPDATE sumup_attempts SET status = 'MISMATCH', error = 'Nobody answered' WHERE id = ?`).run(charge)
      database.query(`INSERT INTO night_reports (id, performance_id, venue_id, night, closing_note, report, signed_by, signed_via)
        VALUES (?, ?, ?, ?, 'Signed before the charge was found', '{}', ?, 'SHIFT')`).run(`report-${charge}`, late.performanceId, late.venueId, night, bar.id)
    }
    finally {
      database.close()
    }
    expect((await closeTill(opened.session.id, bar.cookie, 450, 'The reader holds a charge nobody answered')).status).toBe(200)

    const record = (as: string, expectedTotalPence: number): Promise<Response> =>
      request(app, 'POST', `/api/admin/finance/late-charges/${charge}`, { expectedTotalPence }, as)

    expect((await record(bar.cookie, 450)).status).toBe(403)

    const stale = await record(treasurer.cookie, 400)
    expect(stale.status).toBe(409)
    const refusal = await message(stale)
    expect(refusal).toContain('£4.00')
    expect(refusal).toContain('£4.50')

    const recorded = await record(treasurer.cookie, 450)
    expect(recorded.status).toBe(200)
    const outcome = await recorded.json() as { status: string, receipt: { entryId: string } | null }
    expect(outcome.status).toBe('SUCCEEDED')
    const entryId = outcome.receipt!.entryId

    const [attempt] = read<{ createdAt: number }>('SELECT created_at AS createdAt FROM sumup_attempts WHERE id = ?', charge)
    expect(read('SELECT happened_at AS happenedAt, till_session_id AS sessionId, total_pence AS totalPence FROM ledger_entries WHERE id = ?', entryId))
      .toEqual([{ happenedAt: attempt!.createdAt, sessionId: opened.session.id, totalPence: 450 }])
    expect(read<{ actorId: string }>(`SELECT actor_id AS actorId FROM audit_log WHERE action = 'bar.till.sale.late' AND target = ?`, `ledger-entry:${entryId}`))
      .toEqual([{ actorId: treasurer.id }])
    expect(read<{ note: string }>('SELECT note FROM night_report_addenda WHERE report_id = ?', `report-${charge}`)[0]?.note).toContain('£4.50')

    const again = await record(treasurer.cookie, 450)
    expect(again.status).toBe(409)
    expect(read('SELECT id FROM sumup_attempts WHERE id = ? AND entry_id = ?', charge, entryId)).toHaveLength(1)
    expect(read(`SELECT id FROM audit_log WHERE action = 'bar.till.sale.late' AND detail LIKE ?`, `%${charge}%`)).toHaveLength(1)
  }, 120_000)
})

// 0040, issue 897: a permission held without its second factor names the way out, same as every
// console list.
describe.skipIf(skip !== null)('a till refusal held to a missing second factor', () => {
  test('the till shows an enrolment link rather than a bare refusal', async () => {
    // Narrowed for one request rather than widened: the bar manager account carries no
    // authenticator, matching a real committee member who has never needed one before.
    overrideConfig(app, 'PRIVILEGED_ROLES', ['BAR_MANAGER'])
    try {
      const enrolling = programme('till-enrol')
      const password = generatePassword()
      const noFactor = await registerMember(app, 'till-enrol-bar', password)
      await request(app, 'POST', '/api/admin/roles', { userId: noFactor.id, role: 'BAR_MANAGER' }, admin.cookie)

      const view = await openSignedOutView(app.baseURL)
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', noFactor.email)
      await fill(view, 'form input[type="password"]', password)
      await click(view, 'form button[type="submit"]')
      await finishSignIn(app, view, noFactor.email)

      await visit(view, `${app.baseURL}/tonight/till?venueId=${enrolling.venueId}`, 'body')
      await waitFor(view, `document.querySelector('[data-test="till-failure"]')`)
      const shown = await textOf(view, '[data-test="till-failure"]')
      expect(shown).toMatch(/authenticator/i)
      expect(shown).toContain('Set up an authenticator app')
      view.close()
    }
    finally {
      clearConfigOverride(app, 'PRIVILEGED_ROLES')
    }
  }, 120_000)

  // Tonight's shift opens the till with no second factor; the earlier nights' list is the role's
  // alone, so its refusal shows rather than an empty screen (issue 1316).
  test('a Bar Manager on tonight\'s shift without an authenticator is told why earlier nights are not listed', async () => {
    overrideConfig(app, 'PRIVILEGED_ROLES', ['BAR_MANAGER'])
    try {
      const working = programme('till-enrol-shift')
      const password = generatePassword()
      const noFactor = await registerMember(app, 'till-enrol-shift-bar', password)
      await request(app, 'POST', '/api/admin/roles', { userId: noFactor.id, role: 'BAR_MANAGER' }, admin.cookie)
      shiftFor(working.performanceId, 'BAR', noFactor.id)

      const view = await openSignedOutView(app.baseURL)
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', noFactor.email)
      await fill(view, 'form input[type="password"]', password)
      await click(view, 'form button[type="submit"]')
      await finishSignIn(app, view, noFactor.email)

      await visit(view, `${app.baseURL}/tonight/till?venueId=${working.venueId}`, '[data-test="till-closed"]')
      await waitFor(view, `document.querySelector('[data-test="till-earlier-failure"]')`)
      const shown = await textOf(view, '[data-test="till-earlier-failure"]')
      expect(shown).toMatch(/authenticator/i)
      expect(shown).toContain('Set up an authenticator app')
      view.close()
    }
    finally {
      clearConfigOverride(app, 'PRIVILEGED_ROLES')
    }
  }, 120_000)
})

describe.skipIf(skip !== null)('asking for and giving a comp from the till (F-110, A10)', () => {
  test('a bar-only basket can be asked, waited on and given once approved', async () => {
    const screenPassword = generatePassword()
    const screenBar = await registerMember(app, 'till-comp-ask', screenPassword)
    await grantRole(app, screenBar, 'BAR_MANAGER', admin.cookie)
    const comping = programme('till-comp')
    await openTill(comping.venueId, screenBar.cookie)
    const { productId } = await aSellableProduct(300)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', screenBar.email)
    await fill(view, 'form input[type="password"]', screenPassword)
    await click(view, 'form button[type="submit"]')
    await finishSignIn(app, view, screenBar.email)

    await visit(view, `${app.baseURL}/tonight/till?venueId=${comping.venueId}`, `[data-test="till-open"]`)
    await click(view, `[data-test="product-${productId}"]`)
    await waitFor(view, `document.querySelector('[data-test="till-comp-chip"]')`)
    await click(view, '[data-test="till-comp-chip"]')
    await waitFor(view, `document.querySelector('[data-test="comp-reason"]')`)
    await fill(view, '[data-test="comp-reason"]', 'Committee guest, cleared with the duty manager')
    await click(view, '[data-test="comp-send"]')
    await waitFor(view, `document.querySelector('[data-test="comp-waiting"]')`)

    // The basket a request names cannot also be charged for money while it is in flight
    // (F-110 criterion 4): neither charge control is on offer.
    expect(await view.evaluate<boolean>(`!!document.querySelector('[data-test="charge-reader"]')`)).toBe(false)
    expect(await view.evaluate<boolean>(`!!document.querySelector('[data-test="charge-sumup"]')`)).toBe(false)

    // Closing the modal never cancels the ask: the poll keeps running, and the pending chip
    // reopens onto the same request once it is decided (Stream 6 A10, review finding).
    await click(view, '[data-test="comp-keep-waiting"]')
    await waitFor(view, `document.querySelector('[data-test="till-comp-pending-chip"]')`)

    // The basket the request named stays as sent: the sheet does not open over it, and no Undo
    // is offered for the press that filled it (issue 1311).
    expect(await view.evaluate<boolean>(`document.querySelector('[data-test="basket-summary-open"]').disabled`)).toBe(true)
    await view.evaluate(`document.querySelector('[data-test="basket-summary-open"]').click()`)
    expect(await view.evaluate<boolean>(`!!document.querySelector('[data-test="basket-sheet"]')`)).toBe(false)
    expect(await view.evaluate<boolean>(`!!document.querySelector('[data-test="basket-added-undo"]')`)).toBe(false)

    // Decided from elsewhere, exactly as an approving manager would on the glance screen, while
    // the till itself only polls the single request it asked for (Stream 6 A10).
    const listed = await request(app, 'GET', `/api/till/comp-requests?venueId=${comping.venueId}`, undefined, bar2.cookie)
    const { requests } = await listed.json() as { requests: { request: { id: string } }[] }
    const requestId = requests[0]!.request.id
    await request(app, 'POST', `/api/till/comp-requests/${requestId}/approve`, {}, bar2.cookie)

    await waitFor(view, `document.querySelector('[data-test="till-comp-pending-chip"]').textContent.includes('Give the comp')`)
    await click(view, '[data-test="till-comp-pending-chip"]')
    await waitFor(view, `document.querySelector('[data-test="comp-give"]')`)
    await click(view, '[data-test="comp-give"]')
    await waitFor(view, `document.querySelector('[data-test="comp-given-confirmation"]')`)
    view.close()
  }, 120_000)

  test('a declined request says why, rather than leaving the till waiting forever', async () => {
    const screenPassword = generatePassword()
    const screenBar = await registerMember(app, 'till-comp-decline', screenPassword)
    await grantRole(app, screenBar, 'BAR_MANAGER', admin.cookie)
    const comping = programme('till-comp-decline')
    await openTill(comping.venueId, screenBar.cookie)
    const { productId } = await aSellableProduct(200)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', screenBar.email)
    await fill(view, 'form input[type="password"]', screenPassword)
    await click(view, 'form button[type="submit"]')
    await finishSignIn(app, view, screenBar.email)

    await visit(view, `${app.baseURL}/tonight/till?venueId=${comping.venueId}`, `[data-test="till-open"]`)
    await click(view, `[data-test="product-${productId}"]`)
    await waitFor(view, `document.querySelector('[data-test="till-comp-chip"]')`)
    await click(view, '[data-test="till-comp-chip"]')
    await waitFor(view, `document.querySelector('[data-test="comp-reason"]')`)
    await fill(view, '[data-test="comp-reason"]', 'Asking anyway')
    await click(view, '[data-test="comp-send"]')
    await waitFor(view, `document.querySelector('[data-test="comp-waiting"]')`)

    const listed = await request(app, 'GET', `/api/till/comp-requests?venueId=${comping.venueId}`, undefined, bar2.cookie)
    const { requests } = await listed.json() as { requests: { request: { id: string } }[] }
    const requestId = requests[0]!.request.id
    await request(app, 'POST', `/api/till/comp-requests/${requestId}/decline`, { reason: 'Not tonight' }, bar2.cookie)

    await waitFor(view, `document.querySelector('[data-test="comp-declined"]')`)
    const shown = await textOf(view, '[data-test="comp-declined"]')
    expect(shown).toContain('Not tonight')
    view.close()
  }, 120_000)

  // A comp never skips Challenge 25 (F-106, even though nothing is taken), and the prompt has to
  // close behind it, or a second tap on an ID button would fire the give again.
  test('a restricted line still needs a Challenge 25 outcome, and the prompt closes once given', async () => {
    const screenPassword = generatePassword()
    const screenBar = await registerMember(app, 'till-comp-restricted', screenPassword)
    await grantRole(app, screenBar, 'BAR_MANAGER', admin.cookie)
    const comping = programme('till-comp-restricted')
    await openTill(comping.venueId, screenBar.cookie)
    const { productId } = await aSellableProduct(400, true)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', screenBar.email)
    await fill(view, 'form input[type="password"]', screenPassword)
    await click(view, 'form button[type="submit"]')
    await finishSignIn(app, view, screenBar.email)

    await visit(view, `${app.baseURL}/tonight/till?venueId=${comping.venueId}`, `[data-test="till-open"]`)
    await click(view, `[data-test="product-${productId}"]`)
    await waitFor(view, `document.querySelector('[data-test="till-comp-chip"]')`)
    await click(view, '[data-test="till-comp-chip"]')
    await waitFor(view, `document.querySelector('[data-test="comp-reason"]')`)
    await fill(view, '[data-test="comp-reason"]', 'Cast member, age checked at the door')
    await click(view, '[data-test="comp-send"]')

    const listed = await request(app, 'GET', `/api/till/comp-requests?venueId=${comping.venueId}`, undefined, bar2.cookie)
    const { requests } = await listed.json() as { requests: { request: { id: string } }[] }
    const requestId = requests[0]!.request.id
    await request(app, 'POST', `/api/till/comp-requests/${requestId}/approve`, {}, bar2.cookie)

    await waitFor(view, `document.querySelector('[data-test="till-comp-pending-chip"]').textContent.includes('Give the comp')`)
    await click(view, '[data-test="till-comp-pending-chip"]')
    await waitFor(view, `document.querySelector('[data-test="comp-give"]')`)
    await click(view, '[data-test="comp-give"]')
    await waitFor(view, `document.querySelector('[data-test="age-check-id-passport"]')`)
    await click(view, '[data-test="age-check-id-passport"]')

    await waitFor(view, `document.querySelector('[data-test="comp-given-confirmation"]')`)
    expect(await view.evaluate<boolean>(`!!document.querySelector('[data-test="age-check-id-passport"]')`)).toBe(false)
    view.close()
  }, 120_000)
})

// K-102 and issue 1150 item 8: the show-night layout itself. These wait for the nightly run.
describe.skipIf(skip !== null)('the show-night layout (K-102, issue 1150 item 8)', () => {
  // `aSellableProduct` makes a category of its own each time, so a second one is what puts the
  // category chips on the grid at all.
  async function atTheTill(secondCategory = false, size?: { width: number, height: number }): Promise<{ view: Bun.WebView, productId: string }> {
    const password = generatePassword()
    const staff = await registerMember(app, `till-layout-${crypto.randomUUID().slice(0, 6)}`, password)
    await grantRole(app, staff, 'BAR_MANAGER', admin.cookie)
    const where = programme(`till-layout-${crypto.randomUUID().slice(0, 6)}`)
    await openTill(where.venueId, staff.cookie)
    const { productId } = await aSellableProduct(300)
    if (secondCategory) await aSellableProduct(250)

    const view = await openSignedOutView(app.baseURL, size)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', staff.email)
    await fill(view, 'form input[type="password"]', password)
    await click(view, 'form button[type="submit"]')
    await finishSignIn(app, view, staff.email)
    await visit(view, `${app.baseURL}/tonight/till?venueId=${where.venueId}`, `[data-test="product-${productId}"]`)
    return { view, productId }
  }

  // A pane torn down and rebuilt takes the camera with it, which is the door's lesson (PR 1157).
  test('both panes stay mounted, so switching never remounts the scanner', async () => {
    const { view } = await atTheTill()
    await waitFor(view, `document.querySelector('#pane-tickets-panel')`)

    await view.evaluate(`document.querySelector('#pane-tickets-panel').dataset.aliveMarker = 'kept'`)
    await click(view, '[data-test="till-pane-tickets"]')
    await waitFor(view, `document.querySelector('#pane-tickets-panel').offsetParent !== null`)
    await click(view, '[data-test="till-pane-bar"]')
    await waitFor(view, `document.querySelector('#pane-bar-panel').offsetParent !== null`)

    expect(await view.evaluate<string>(`document.querySelector('#pane-tickets-panel').dataset.aliveMarker`)).toBe('kept')
    view.close()
  }, 120_000)

  test('each pane is named by the tab that opens it', async () => {
    const { view } = await atTheTill()
    const labelled = `(() => {
      return ['#pane-bar-panel', '#pane-tickets-panel'].map((selector) => {
        const panel = document.querySelector(selector)
        const by = panel && panel.getAttribute('aria-labelledby')
        const tab = by && document.getElementById(by)
        return { role: panel && panel.getAttribute('role'), label: tab && tab.textContent.trim() }
      })
    })()`
    const panes = await view.evaluate<{ role: string | null, label: string | null }[]>(labelled)
    expect(panes[0]).toEqual({ role: 'tabpanel', label: 'Bar' })
    expect(panes[1]).toEqual({ role: 'tabpanel', label: 'Tickets' })
    view.close()
  }, 120_000)

  // A hint is for the first sale on this phone, not a line above every one of them (issue 1317).
  test('the hint shows on a first visit, and goes once there is something in the basket', async () => {
    const { view, productId } = await atTheTill()
    await view.evaluate(`localStorage.removeItem('nnt-night-hint:Till')`)
    await visit(view, await view.evaluate<string>('location.href'), `[data-test="product-${productId}"]`)
    await waitFor(view, `document.querySelector('[data-test="night-hint"]')`)
    expect(await textOf(view, '[data-test="night-hint"]')).toContain('Tap an item to add it')

    await click(view, `[data-test="product-${productId}"]`)
    await waitFor(view, `document.querySelector('[data-test="night-hint"]') === null`)
    view.close()
  }, 120_000)

  // The pinned area is the thumb's, and every row in it costs one (K-102 criterion 2).
  test('the pinned area stacks no more than three rows on a phone', async () => {
    const { view, productId } = await atTheTill()
    await click(view, `[data-test="product-${productId}"]`)
    await waitFor(view, `document.querySelector('[data-test="basket-summary-bar"]')`)

    const rows = await view.evaluate<number>(`document.querySelector('[data-test="night-actions"]').children.length`)
    expect(rows).toBeLessThanOrEqual(3)
    view.close()
  }, 120_000)

  // F-103 criterion 6: a chip narrows the grid to its category; All brings the rest back.
  test('a category chip filters the grid, and All brings every tile back', async () => {
    const { view, productId } = await atTheTill(true)
    await waitFor(view, `document.querySelectorAll('[data-test="category-chips"] button').length === 3`)
    const tiles = `document.querySelectorAll('[data-test^="product-"]').length`
    expect(await view.evaluate<number>(tiles)).toBe(2)

    const otherChip = `(() => {
      const mine = document.querySelector('[data-test="product-${productId}"]').closest('[id^="till-category-"]').id.replace('till-category-', '')
      return [...document.querySelectorAll('[data-test^="category-chip-"]')].map(chip => chip.dataset.test).find(name => name !== 'category-chip-all' && name !== 'category-chip-' + mine)
    })()`
    const other = await view.evaluate<string>(otherChip)
    await click(view, `[data-test="${other}"]`)
    await waitFor(view, `${tiles} === 1`)
    expect(await view.evaluate<boolean>(`document.querySelector('[data-test="product-${productId}"]') === null`)).toBe(true)
    expect(await view.evaluate<string>(`document.querySelector('[data-test="${other}"]').getAttribute('aria-pressed')`)).toBe('true')

    await click(view, '[data-test="category-chip-all"]')
    await waitFor(view, `${tiles} === 2`)
    view.close()
  }, 120_000)

  // Issue 1311: the bar under the thumb opens the basket as a sheet, so checking or correcting it
  // never means scrolling past the grid and back.
  test('the summary bar opens the basket as a sheet, and a line changed there changes the total', async () => {
    const { view, productId } = await atTheTill()
    await click(view, `[data-test="product-${productId}"]`)
    await click(view, '[data-test="basket-summary-open"]')
    await waitFor(view, `document.querySelector('[data-test="basket-sheet"] [data-test^="line-plus-"]')`)
    await view.evaluate(`document.querySelector('[data-test="basket-sheet"] [data-test^="line-plus-"]').click()`)
    await waitFor(view, `document.querySelector('[data-test="basket-sheet"] [data-test^="line-qty-"]').textContent.trim() === '2'`)
    await waitFor(view, `document.querySelector('[data-test="basket-summary-total"]').textContent.includes('£6.00')`)
    view.close()
  }, 120_000)

  test('a tap says what it added in the bar, and Undo takes it back', async () => {
    const { view, productId } = await atTheTill()
    await click(view, `[data-test="product-${productId}"]`)
    await waitFor(view, `document.querySelector('[data-test="basket-added"]')`)
    expect(await textOf(view, '[data-test="basket-added"]')).toContain('Added: Variance')
    await click(view, '[data-test="basket-added-undo"]')
    await waitFor(view, `!document.querySelector('[data-test="basket"]')`)
    view.close()
  }, 120_000)

  // A tile is the name, the price, a small ID mark and a corner allergen control: one row of
  // controls, so a tile is no taller than two thumb targets (issue 1311).
  test('a tile keeps its allergen control in the corner, on the same row as the product', async () => {
    const { view, productId } = await atTheTill()
    const measured = await view.evaluate<{ tile: number, sameRow: boolean, inside: boolean }>(`(() => {
      const product = document.querySelector('[data-test="product-${productId}"]').getBoundingClientRect()
      const allergen = document.querySelector('[data-test="allergen-${productId}"]').getBoundingClientRect()
      const tile = document.querySelector('[data-test="tile-${productId}"]').getBoundingClientRect()
      return {
        tile: tile.height,
        sameRow: allergen.top < product.bottom && allergen.bottom > product.top,
        inside: allergen.right <= tile.right + 1 && allergen.top >= tile.top - 1,
      }
    })()`)
    expect(measured.sameRow).toBe(true)
    expect(measured.inside).toBe(true)
    expect(measured.tile).toBeLessThan(2 * NIGHT_TAP_TARGET_PX)
    view.close()
  }, 120_000)

  // Every control on a show-night screen, not only the primary ones (design-language.md rule 4).
  test('every control a thumb reaches for clears 48 pixels', async () => {
    const { view, productId } = await atTheTill(true)
    await waitFor(view, `document.querySelector('[data-test="category-chips"] button')`)
    await click(view, `[data-test="product-${productId}"]`)
    await waitFor(view, `document.querySelector('[data-test="till-comp-chip"]')`)
    // A second press brings Added back, so Undo is there to measure whatever the price took.
    await click(view, `[data-test="product-${productId}"]`)
    await waitFor(view, `document.querySelector('[data-test="basket-added-undo"]')`)

    const sizes = `[
      ...document.querySelectorAll('[data-test="category-chips"] button'),
      document.querySelector('[data-test="allergen-${productId}"]'),
      document.querySelector('[data-test="till-comp-chip"]'),
      document.querySelector('[data-test="till-overflow-menu"]'),
      document.querySelector('[data-test="basket-summary-open"]'),
      document.querySelector('[data-test="basket-added-undo"]'),
      ...document.querySelectorAll('[role="tab"]'),
    ].map(control => control.getBoundingClientRect()).map(box => Math.round(Math.min(box.height, box.width)))`
    const measured = await view.evaluate<number[]>(sizes)
    expect(measured.length).toBeGreaterThanOrEqual(8)
    for (const size of measured) expect(size).toBeGreaterThanOrEqual(NIGHT_TAP_TARGET_PX)

    await click(view, '[data-test="basket-summary-open"]')
    await waitFor(view, `document.querySelector('[data-test="basket-sheet-close"]')`)
    const back = await view.evaluate<number>(`Math.round(document.querySelector('[data-test="basket-sheet-close"]').getBoundingClientRect().height)`)
    expect(back).toBeGreaterThanOrEqual(NIGHT_TAP_TARGET_PX)
    view.close()
  }, 120_000)

  // K-102 criterion 1: the bar's one row, the press named with its Undo beside the comp chip and the
  // total, still fits the narrowest phone the show-night screens are built for.
  test('the bar under the thumb fits a 360 pixel phone while a press is named', async () => {
    const { view, productId } = await atTheTill(false, { width: NIGHT_VIEWPORT_PX, height: 780 })
    await click(view, `[data-test="product-${productId}"]`)
    await waitFor(view, `document.querySelector('[data-test="till-comp-chip"]')`)
    await click(view, `[data-test="product-${productId}"]`)
    await waitFor(view, `document.querySelector('[data-test="basket-added"]') && document.querySelector('[data-test="till-comp-chip"]')`)
    expect(await view.evaluate<boolean>(`document.documentElement.scrollWidth <= window.innerWidth`)).toBe(true)
    view.close()
  }, 120_000)
})
