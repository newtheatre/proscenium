import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import { currentShowNight } from '#shared/utils/show-night'
import { officerBypassTarget } from '#shared/utils/night-authority'
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
  await request(app, 'POST', '/api/admin/roles', { userId: foh.id, role: 'FOH_MANAGER' }, admin.cookie)
  await request(app, 'POST', '/api/admin/roles', { userId: bar.id, role: 'BAR_MANAGER' }, admin.cookie)
  await request(app, 'POST', '/api/admin/roles', { userId: bar2.id, role: 'BAR_MANAGER' }, admin.cookie)

  house = programme('till-house')
  studio = programme('till-studio')
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

function programme(suffix: string): { venueId: string, performanceId: string } {
  const database = new Database(app.databaseFile)
  try {
    const made = tonightsPerformance({
      batch: statements => database.transaction(() => {
        for (const [statement, ...parameters] of statements) database.prepare(statement).run(...parameters as never[])
      })(),
    }, { suffix })
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
}

const openTill = (venueId: string, as?: string): Promise<Response> =>
  request(app, 'POST', '/api/till', { venueId }, as)

const closeTill = (id: string, as?: string): Promise<Response> =>
  request(app, 'POST', '/api/till/close', { id }, as)

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
    expect(refusal).toContain('BAR')
    expect(refusal).toContain('bar manager')
  })

  test('the front of house officer does not open the till', async () => {
    const response = await openTill(studio.venueId, foh.cookie)
    expect(response.status).toBe(403)
    expect(await message(response)).toContain('bar manager')
  })

  test('an ordinary member is refused, and told what would unlock it', async () => {
    const response = await openTill(studio.venueId, member.cookie)
    expect(response.status).toBe(403)
    const refusal = await message(response)
    expect(refusal).toContain('BAR')
    expect(refusal).toContain('bar manager')
  })

  test('a signed-out caller gets no further', async () => {
    expect((await openTill(studio.venueId)).status).toBe(401)
  })
})

describe.skipIf(skip !== null)('authority is checked on every request, not cached (F-101 criterion 3)', () => {
  test('revoking the bar manager role refuses the very next request', async () => {
    const volunteer = await registerMember(app, 'till-revoked', generatePassword())
    await request(app, 'POST', '/api/admin/roles', { userId: volunteer.id, role: 'BAR_MANAGER' }, admin.cookie)

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
    expect(closed.session).toMatchObject({ id: opened.session.id, closedBy: bar.id })
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

  test('an ordinary member cannot close tonight\'s session', async () => {
    const closing = programme('till-close-refusal')
    const opened = await (await openTill(closing.venueId, bar.cookie)).json() as { session: TillSessionBody }

    expect((await closeTill(opened.session.id, member.cookie)).status).toBe(403)
  })

  test('closing a session that does not exist is a 404', async () => {
    expect((await closeTill('no-such-session', bar.cookie)).status).toBe(404)
  })
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
    expect(await message(response)).toContain('bar manager')
  })
})
